#!/usr/bin/env python3
"""Repository checks that need no network: leaked secrets, risky code patterns, workflow mistakes, broken links.

Run it from the repository root:   python3 scripts/check-repo.py
It exits with 1 if it finds an error. CI runs it on every change. It complements, and does not replace,
CodeQL, gitleaks, dependency review and npm audit (see docs/GITHUB.md).
"""
import json, os, re, sys
try:
    import yaml
except ImportError:
    sys.exit("PyYAML is missing: pip install pyyaml")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
errors, warnings = [], []
def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)

SKIP_DIRS = {'.git', 'node_modules', 'dist', '.storage', 'playwright-report', 'test-results', '__pycache__'}
def walk():
    for d, dirs, files in os.walk('.'):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files: yield os.path.normpath(os.path.join(d, f))
FILES = sorted(walk())
def read(p):
    try:
        with open(p, encoding='utf-8') as f: return f.read()
    except (UnicodeDecodeError, OSError): return None

# ------------------------------------------------------------------ A. secrets and sensitive files
BAD_NAMES = re.compile(r'(^|/)(\.env(\.[^/]*)?|id_rsa[^/]*|id_ed25519[^/]*|[^/]*\.(pem|key|p12|pfx|dump|sql\.gz))$')
for p in FILES:
    if BAD_NAMES.search(p) and not p.endswith('.env.example') and not p.endswith('.pub'):
        err(f'{p}: sensitive file name. Remove it from the repository and rotate anything it contained.')

SECRET_PATTERNS = [
    ('AWS access key id', re.compile(r'\bAKIA[0-9A-Z]{16}\b')),
    ('private key block', re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----')),
    ('GitHub token', re.compile(r'\bgh[pousr]_[A-Za-z0-9]{36,}\b')),
    ('Slack token', re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{10,}')),
    ('Google API key', re.compile(r'\bAIza[0-9A-Za-z_-]{35}\b')),
    ('JSON web token', re.compile(r'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}')),
    ('hard-coded credential', re.compile(r'(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*[\'"][A-Za-z0-9+/_\-]{16,}[\'"]')),
]
SECRET_ALLOWED = re.compile(r'^(server/tests/|web/tests/|web/e2e/|docs/|\.github/workflows/ci\.yml$|.*\.env\.example$|scripts/check-repo\.py$|\.gitleaks\.toml$)')
for p in FILES:
    if SECRET_ALLOWED.match(p): continue
    text = read(p)
    if text is None: continue
    for name, rx in SECRET_PATTERNS:
        for m in rx.finditer(text):
            line = text.count('\n', 0, m.start()) + 1
            err(f'{p}:{line}: looks like a {name}.')

# ------------------------------------------------------------------ B. risky code patterns
RISKY = [
    ('server/src', re.compile(r'\$(?:query|execute)RawUnsafe'), 'raw SQL string (use the tagged-template form)'),
    ('server/src', re.compile(r'\bMath\.random\('), 'Math.random is not secure; use node:crypto'),
    ('server/src', re.compile(r"origin:\s*(?:'\*'|\"\*\"|true)"), 'CORS must use an exact allowlist'),
    ('server/src', re.compile(r'rejectUnauthorized:\s*false'), 'TLS verification must not be disabled'),
    ('server/src', re.compile(r"sameSite:\s*'none'"), 'session cookies must not be SameSite=None'),
    ('server/src', re.compile(r'\bchild_process\b'), 'spawning processes is not expected in the server'),
    ('web/src', re.compile(r'dangerouslySetInnerHTML'), 'never inject HTML; React escapes text for you'),
    ('web/src', re.compile(r'\.innerHTML\s*='), 'never assign innerHTML'),
    ('web/src', re.compile(r'\b(?:eval|new Function)\s*\('), 'dynamic code execution is not allowed'),
    ('web/src', re.compile(r'\bsessionStorage\b'), 'do not keep data in sessionStorage'),
    ('web/src', re.compile(r"\bstyle=[\"']"), 'inline style attributes conflict with the CSP'),
]
for folder, rx, why in RISKY:
    for p in FILES:
        if not p.startswith(folder + '/') or not p.endswith(('.ts', '.tsx')): continue
        text = read(p) or ''
        for m in rx.finditer(text):
            err(f"{p}:{text.count(chr(10), 0, m.start()) + 1}: {why}.")
for p in FILES:  # localStorage may only be used by the favorites module
    if p.startswith('web/src/') and p.endswith(('.ts', '.tsx')) and 'localStorage' in (read(p) or '') and p != 'web/src/lib/storage.ts':
        err(f'{p}: only web/src/lib/storage.ts may use localStorage.')

# ------------------------------------------------------------------ C. GitHub workflows
WF = [p for p in FILES if p.startswith('.github/workflows/') and p.endswith(('.yml', '.yaml'))]
UNTRUSTED = re.compile(r'\$\{\{\s*(github\.event\.(?:issue|pull_request|comment|review|head_commit|commits|pages|workflow_run)[^}]*|github\.head_ref|inputs\.[^}]*)\}\}')
workflow_names = set(os.path.basename(p) for p in WF)
for p in WF:
    try:
        doc = yaml.safe_load(read(p))
    except yaml.YAMLError as e:
        err(f'{p}: not valid YAML ({e}).'); continue
    triggers = doc.get(True, doc.get('on'))  # PyYAML reads the key "on" as True
    if not triggers: err(f'{p}: no "on" trigger.')
    if 'permissions' not in doc: err(f'{p}: set top-level "permissions" (least privilege, usually contents: read).')
    jobs = doc.get('jobs') or {}
    if not jobs: err(f'{p}: no jobs.')
    for jname, job in jobs.items():
        if 'runs-on' not in job and 'uses' not in job: err(f'{p}: job {jname} has neither runs-on nor uses.')
        needs = job.get('needs', [])
        for n in ([needs] if isinstance(needs, str) else needs):
            if n not in jobs: err(f'{p}: job {jname} needs unknown job "{n}".')
        if 'uses' in job:
            ref = job['uses']
            if ref.startswith('./') and not os.path.exists(ref[2:]): err(f'{p}: job {jname} calls missing workflow {ref}.')
        steps = job.get('steps', [])
        if 'runs-on' in job and not steps: err(f'{p}: job {jname} has no steps.')
        for i, step in enumerate(steps, 1):
            has_uses, has_run = 'uses' in step, 'run' in step
            if has_uses == has_run: err(f'{p}: job {jname} step {i} needs exactly one of "uses" or "run".')
            if has_uses:
                ref = step['uses']
                if ref.startswith('./'):
                    if not os.path.exists(os.path.join(ref[2:], 'action.yml')): err(f'{p}: step {i} uses missing local action {ref}.')
                elif '@' not in ref: err(f'{p}: step {i} "{ref}" has no version.')
                elif re.search(r'@(main|master|latest)$', ref): err(f'{p}: step {i} "{ref}" is not pinned to a version.')
                elif not re.search(r'@(v?\d[\w.\-]*|[0-9a-f]{40})$', ref): warn(f'{p}: step {i} "{ref}" does not look like a version tag.')
            if has_run:
                for m in UNTRUSTED.finditer(step['run']):
                    err(f'{p}: job {jname} step {i} puts {m.group(0)} straight into a shell script (script injection risk). Pass it through env instead.')
        for k, v in (job.get('env') or {}).items():
            if isinstance(v, str) and re.search(r'secrets\.', v) and 'pull_request_target' in str(triggers): err(f'{p}: secrets with pull_request_target.')
    if 'pull_request_target' in str(triggers): warn(f'{p}: pull_request_target runs with write access; make sure it never checks out untrusted code.')

# composite action
for p in [x for x in FILES if x.startswith('.github/actions/') and x.endswith('action.yml')]:
    doc = yaml.safe_load(read(p))
    for i, step in enumerate(doc['runs']['steps'], 1):
        if 'run' in step and 'shell' not in step: err(f'{p}: step {i} needs "shell:" in a composite action.')

# ------------------------------------------------------------------ D. files that other files rely on
docker = read('server/Dockerfile') or ''
for m in re.finditer(r'^COPY\s+((?:--\S+\s+)*)(.+?)\s+\S+$', docker, re.M):
    if '--from=' in m.group(1): continue  # copied from another build stage, not from the folder
    for src in m.group(2).split():
        if src.startswith('--') or '*' in src: continue
        if not os.path.exists(os.path.join('server', src)): err(f'server/Dockerfile: COPY source "{src}" does not exist in server/.')
for stage in ('runtime', 'tools'):
    if not re.search(rf'AS {stage}\b', docker): err(f'server/Dockerfile: missing target "{stage}" used by the workflows.')
if not re.search(r'AS runtime[\s\S]*\nUSER node', docker): err('server/Dockerfile: the runtime image must run as a non-root user.')
if re.search(r'^FROM\s+\S+:latest', docker, re.M): err('server/Dockerfile: do not use :latest base images.')

compose = yaml.safe_load(read('deploy/docker-compose.yml'))
for name, svc in compose['services'].items():
    for vol in svc.get('volumes', []) or []:
        src = str(vol).split(':')[0]
        if src.startswith('./') and src[2:] not in ('web', 'headers.caddy') and not os.path.exists(os.path.join('deploy', src[2:])):
            err(f'deploy/docker-compose.yml: service {name} mounts missing file {src}.')
    if name in ('api', 'games'):
        if not svc.get('read_only'): err(f'deploy/docker-compose.yml: {name} should run with a read-only filesystem.')
        if svc.get('cap_drop') != ['ALL']: err(f'deploy/docker-compose.yml: {name} should drop all capabilities.')
    for port in svc.get('ports', []) or []:
        if name != 'caddy': err(f'deploy/docker-compose.yml: only caddy may publish ports (found {name}: {port}).')

for need in ('SECURITY.md', '.gitignore', '.gitleaks.toml', '.github/dependabot.yml', 'docs/GITHUB.md', 'server/prisma/migrations/migration_lock.toml'):
    if not os.path.exists(need): err(f'missing required file {need}.')
if not any(os.path.basename(p).upper().startswith('LICENSE') for p in FILES if '/' not in p):
    warn('no LICENSE file. Choose one (or keep the code private) before sharing the repository.')
gi = read('.gitignore') or ''
for must in ('.env', 'node_modules', 'dist'):
    if must not in gi: err(f'.gitignore does not ignore {must}.')

# package.json sanity
needed = {'server': ['typecheck', 'lint', 'test:unit', 'test:integration', 'build', 'start'], 'web': ['typecheck', 'lint', 'test', 'build', 'e2e']}
for pkg, scripts in needed.items():
    data = json.loads(read(f'{pkg}/package.json'))
    for s in scripts:
        if s not in data.get('scripts', {}): err(f'{pkg}/package.json: missing script "{s}" that CI calls.')
    for group in ('dependencies', 'devDependencies'):
        for dep, ver in data.get(group, {}).items():
            if ver in ('latest', '*', '') or ver.startswith(('git', 'http', 'file:', 'github:')): err(f'{pkg}/package.json: {dep} uses an unpinned or remote version "{ver}".')

# migrations
mig_root = 'server/prisma/migrations'
dirs = sorted(d for d in os.listdir(mig_root) if os.path.isdir(os.path.join(mig_root, d)))
if not dirs: err('no migrations found.')
for d in dirs:
    sql = read(f'{mig_root}/{d}/migration.sql')
    if not sql: err(f'{mig_root}/{d}: missing migration.sql.'); continue
    if re.search(r'(?im)^\s*DROP\s+(TABLE|DATABASE|SCHEMA)', sql): err(f'{mig_root}/{d}: destructive DROP statement. Review it by hand.')
if not re.search(r'ENABLE ROW LEVEL SECURITY', ''.join(read(f'{mig_root}/{d}/migration.sql') or '' for d in dirs)): err('migrations must enable row-level security.')

# ------------------------------------------------------------------ E. documentation links
for p in [x for x in FILES if x.endswith('.md')]:
    text = read(p) or ''
    for m in re.finditer(r'\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)', text):
        target = m.group(1)
        if re.match(r'^(https?:|mailto:)', target): continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(p), target))): err(f'{p}: broken link to {target}.')

# ------------------------------------------------------------------ report
for w in warnings: print(f'warning: {w}')
for e in errors: print(f'ERROR: {e}')
print(f'\n{len(FILES)} files checked, {len(errors)} error(s), {len(warnings)} warning(s)')
sys.exit(1 if errors else 0)
