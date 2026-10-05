// Suggested emails an advisor can send to a group of students from the hub.
// Written in advance (no AI) so every word is reviewed. Each group has a few
// versions; "Try another version" cycles through them.
//
// Placeholders: {when} (upcoming competition sentence), {link}, {name}.

const LINK = 'https://prep.thebowtiegoat.com';

const TEMPLATES = {
  green: [
    {
      subject: "You're on track. Keep it rolling! 🐐",
      body: "Hi everyone!\n\nI wanted to say great work. You've been putting in the practice, and it shows. {when}\n\nKeep the momentum going: take your next practice exam at {link} and spend a few minutes reviewing the questions you missed. Small, steady practice is how GOATS get GLASS.\n\nProud of you!\n{name}",
    },
    {
      subject: 'Nice work on your exam prep!',
      body: "Hi team,\n\nQuick shout-out: you're right where you need to be with your exam prep. {when}\n\nYour next step: pick another practice exam at {link}, and check your My Results page to see which topics keep showing up in your missed questions. That's where your next few points will come from.\n\nKeep it up!\n{name}",
    },
    {
      subject: "Momentum check: you're crushing it",
      body: "Hi everyone,\n\nYou've been showing up for your prep, and I noticed! {when}\n\nTo stay sharp, try to take one practice exam every week or two at {link}. Every exam you take makes your study list more focused.\n\nLet's keep going!\n{name}",
    },
  ],
  yellow: [
    {
      subject: 'Quick check-in on your exam prep',
      body: "Hi everyone!\n\nJust checking in. It's been a couple of weeks since your last practice exam. {when} That's plenty of time, and a little practice now makes a big difference later.\n\nWhen you have about an hour, log in at {link} and take your next practice exam. Your results will show you exactly what to review.\n\nLet me know if you need anything!\n{name}",
    },
    {
      subject: "Let's keep your prep moving 🐐",
      body: "Hi team,\n\nYou've made a good start, so let's keep it going! {when}\n\nThis week, try to fit in one practice exam at {link}. Then look at your missed questions and pick one or two topics to brush up on.\n\nYou've got this!\n{name}",
    },
    {
      subject: 'Time for your next practice exam',
      body: "Hi everyone,\n\nFriendly reminder: your next practice exam is waiting for you at {link}. {when}\n\nEven one exam this week keeps you sharp and shows you where to focus next.\n\nThanks for all your hard work!\n{name}",
    },
  ],
  red: [
    {
      subject: "Let's get your prep rolling! 🐐",
      body: "Hi everyone!\n\n{when} There's still plenty of time to build momentum, and getting started is the hardest part.\n\nYour next step is simple: log in to {link} this week and take one practice exam. It will show you exactly which topics to study next.\n\nYou've got this, and I'm here if you need anything!\n{name}",
    },
    {
      subject: 'One small step for this week',
      body: "Hi team,\n\nI know things get busy! Here's one small step that will make a big difference: take a practice exam at {link} this week. {when}\n\nDon't worry about your score. The point is to find out what to focus on. If you have trouble logging in or picking an exam, just let me know.\n\nRooting for you!\n{name}",
    },
    {
      subject: 'Your DECA prep is waiting for you',
      body: "Hi everyone,\n\n{when} Now is a great time to jump into exam prep.\n\nSet aside about an hour this week, log in at {link}, and take one practice exam. Your results will turn into a personal study list.\n\nI believe in you. Let's do this!\n{name}",
    },
  ],
  gray: [
    {
      subject: 'A quick update on your DECA prep',
      body: "Hi everyone!\n\n{when}\n\nMore prep for your event is coming to {link}, so keep an eye out. In the meantime, keep working on your event, and let me know if you have any questions.\n\n{name}",
    },
    {
      subject: 'DECA season is on its way 🐐',
      body: "Hi team,\n\nJust a quick note to keep you in the loop. {when}\n\nKeep building your event skills, and watch {link} for new prep tools for your event. I'm here if you need anything!\n\n{name}",
    },
  ],
  all: [
    {
      subject: 'DECA prep update: competition dates',
      body: "Hi everyone!\n\nHere's a quick update on our competition calendar. {when}\n\nThe best way to prepare for your exam is steady practice: take a practice exam at {link} every week or two, and review your missed questions on your My Results page.\n\nLet's make this a great season!\n{name}",
    },
    {
      subject: "Let's make this season count 🐐",
      body: "Hi team,\n\n{when} Now's the time to build great prep habits.\n\nAim for one practice exam every week or two at {link}. Your results will show you exactly which topics to focus on, so every study session counts.\n\nGOATS get GLASS. Let's go!\n{name}",
    },
  ],
};

export function versionCount(group) {
  return (TEMPLATES[group] || TEMPLATES.all).length;
}

function away(days) {
  if (days >= 14) return `${Math.floor(days / 7)} weeks away`;
  if (days > 1) return `${days} days away`;
  return days === 1 ? 'tomorrow' : 'today';
}

const longDate = (ymd) => new Date(`${ymd}T12:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

// competitions: [{ label, date, daysAway }] upcoming, soonest first, no repeats.
export function whenSentence(competitions) {
  if (!competitions.length) return 'Competition season will be here before we know it.';
  if (competitions.length === 1) {
    const [c] = competitions;
    return `${c.label} is ${longDate(c.date)}, ${c.daysAway <= 1 ? away(c.daysAway) : `just ${away(c.daysAway)}`}.`;
  }
  const parts = competitions.map((c) => `${c.label} on ${longDate(c.date)} (${away(c.daysAway)})`);
  return `Our next competitions are ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}

export function buildDraft({ group, version = 0, competitions, advisorName }) {
  const list = TEMPLATES[group] || TEMPLATES.all;
  const template = list[version % list.length];
  const fill = (text) => text
    .replaceAll('{when}', whenSentence(competitions))
    .replaceAll('{link}', LINK)
    .replaceAll('{name}', advisorName || '');
  return { subject: fill(template.subject), body: fill(template.body).trim() };
}
