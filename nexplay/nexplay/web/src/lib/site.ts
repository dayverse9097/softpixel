/**
 * Editable site content. Change these values to match your own site; the pages read from here.
 * Keep the privacy text accurate: it describes what this application actually does.
 */
export const site = {
  name: 'NEXPLAY',
  tagline: 'Play original browser games in one tap.',
  /** Add an address to show a mail link on the Contact page. Leave empty to show a notice instead. */
  contactEmail: '',
  policyUpdated: 'October 10, 2026',
  about: [
    'NEXPLAY is a library of original games that run in your browser. Open a game and it starts. There is nothing to install and no account to create.',
    'Every game runs inside its own sandboxed frame on a separate domain. A game cannot read this site’s saved data or send you to another page.',
  ],
  privacy: [
    'NEXPLAY has no visitor accounts, no analytics, and no advertising trackers. Visitors are not given cookies.',
    'Your favorites and recently played games are saved in your browser’s local storage on this device. They are not sent to a server. You can clear recently played from the Favorites page, and you can remove everything by clearing this site’s data in your browser settings.',
    'When you start a game, the site sends one anonymous request that adds one to that game’s daily launch count. It carries no identifier. Your network address is held briefly, about a minute, only to limit abuse, and is not stored with the count.',
    'Fonts are served from this site, so no third-party font service is contacted.',
    'Games are served from a separate domain, which receives your network address as any website does when a page loads.',
    'Administrators sign in with a cookie that is used only for the admin area.',
  ],
  terms: [
    'These terms are placeholder text. Replace them with your own before the site goes public.',
    'Games are provided as they are, without warranty of any kind.',
  ],
} as const;
