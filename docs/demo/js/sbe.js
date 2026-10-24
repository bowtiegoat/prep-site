// School-based Enterprise (SBE) certification: DECA's links and this year's
// dates. The admin sets the dates once for every chapter (settings/site.sbe).
// DECA posts these at https://www.deca.org/sbe.

import { doc, getDoc } from '../mock/firebase-firestore.js';
import { db } from './app.js';

// Same shape as EVENT_LINKS (guidelines shows on the Event Hub), plus the extras the plans link to.
export const SBE_LINKS = {
  SBEC: {
    guidelines: 'https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/6a4bc8b27b23d1c0b273348e_DECA-SBE-27-Chapter%20Certification.pdf',
    recertification: 'https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/6a4bc883d7e4827cd893eed9_DECA-SBE-27-Chapter%20Re-Certification.pdf',
    sample: 'http://www.deca.org/advisor-resources/sbe-gold-certified-sample-paper',
    submitInstructions: 'https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/63adf895124de26a0531ecd9_Online-Submission-Instructions_SBE.pdf',
    submit: 'https://sbe.decaregistration.com/',
  },
  SBEI: {
    guidelines: 'https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/63adf8aecf8c7417973a3a10_SBE-Individual-Certification.pdf',
    instructions: 'https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/63adf8dc124de2148a32637e_deca_sbe_individual_exam_instructions.pdf',
    studyGuide: 'https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/65ae8928e4f3a16a5dddadfd_deca_sbe_individual_exam_study_guide.pdf',
    exam: 'https://www.decaregistration.com/sbe/Main.asp',
  },
};

// chapterDue: DECA's chapter certification deadline. individualTarget: the
// date the individual plan counts back to (DECA's exam window runs Oct 1 to June 30).
export const DEFAULT_SBE = { chapterDue: '2027-01-14', individualTarget: '' };

export async function loadSbeDates() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    return { ...DEFAULT_SBE, ...((snap.exists() && snap.data().sbe) || {}) };
  } catch {
    return DEFAULT_SBE;
  }
}
