import type { ReactNode } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { site } from '../lib/site';

function TextPage({ title, paragraphs, children }: { title: string; paragraphs: readonly string[]; children?: ReactNode }) {
  usePageTitle(title);
  return (
    <div className="wrap">
      <div className="page-title">
        <h1>{title}</h1>
      </div>
      <article className="glass mt-[22px] grid max-w-[760px] gap-4 rounded-panel p-7">
        {paragraphs.map((text) => (
          <p key={text} className="max-w-[66ch] text-muted">
            {text}
          </p>
        ))}
        {children}
      </article>
    </div>
  );
}

export const AboutPage = () => <TextPage title={`About ${site.name}`} paragraphs={site.about} />;

export const PrivacyPage = () => <TextPage title="Privacy policy" paragraphs={[`Last updated ${site.policyUpdated}.`, ...site.privacy]} />;

export const TermsPage = () => <TextPage title="Terms of use" paragraphs={site.terms} />;

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export function ContactPage() {
  const email: string = site.contactEmail;
  const valid = EMAIL.test(email);
  return (
    <TextPage
      title="Contact"
      paragraphs={[valid ? 'Questions or feedback? Send an email to the address below.' : 'No contact address has been set yet. The site owner adds one in the site settings, and it will appear here.']}
    >
      {valid && (
        <p>
          <a href={`mailto:${email}`} className="font-semibold text-neon-cyan">
            {email}
          </a>
        </p>
      )}
    </TextPage>
  );
}
