export const SOURCES = {
  tantrum: { label: 'American Academy of Pediatrics · Tantrums', url: 'https://www.healthychildren.org/English/family-life/family-dynamics/communication-discipline/Pages/Temper-Tantrums.aspx' },
  crying: { label: 'American Academy of Pediatrics · Fussy baby', url: 'https://www.healthychildren.org/English/ages-stages/baby/crying-colic/pages/Calming-A-Fussy-Baby.aspx' }
};

const guides = {
  overwhelmed: {
    response: 'That sounds like a lot to carry right now. If your child is safe, take one minute to slow your breathing and get a glass of water. What is the one thing that needs your attention first? You do not have to solve the whole day at once.',
    action: 'Take a ten-minute reset while my child is safe', recurrence: 'none'
  },
  load: {
    response: 'It sounds like the invisible work is weighing on your family. Try naming one specific responsibility you can own from start to finish, including noticing when it needs doing. A gentle opener: “I want to take something fully off your plate. Which job would make the biggest difference this week?”',
    action: 'Own the family laundry from start to finish', recurrence: 'weekly'
  },
  partner: {
    response: 'Start with curiosity and a concrete offer. You could say: “I can see this week has been heavy. What would help tonight? I can handle bedtime and the cleanup.” Then follow through without asking your partner to manage each step.',
    action: 'Handle bedtime and cleanup', recurrence: 'daily'
  },
  toddler: {
    response: 'Big feelings are common in toddlerhood. Keep your words short, hold a safe limit, and offer two small choices when your child is ready. Check whether hunger or tiredness may be adding to it. If anyone is in danger, make safety the first step.',
    action: 'Prepare a simple calm-down plan for the next hard moment', recurrence: 'none', sources: [SOURCES.tantrum]
  },
  baby: {
    response: 'A crying baby can be exhausting. Check the basics you know: feeding, nappy, temperature, and comfort. If you feel close to losing control, put your baby in a safe place and step away briefly. If the crying seems unusual or you are worried about illness, contact a clinician.',
    action: 'Make a short plan for difficult crying periods', recurrence: 'none', sources: [SOURCES.crying]
  },
  lonely: {
    response: 'Feeling alone in this stage can be painful. Is there one person you could send a simple message to today? “I could use some adult company this week. Fancy a short walk?” Small contact counts.',
    action: 'Invite someone for a short walk or coffee', recurrence: 'none'
  }
};

export function classify(text) {
  const s = text.toLowerCase();
  if (/suicid|kill myself|hurt myself|hurt my baby|shake (the )?baby|harming my child|harm my child|immediate danger/i.test(s)) return 'urgent';
  if (/medical|fever|temperature|rash|breath|dose|medicine|injur|diagnos|postpartum depression/i.test(s)) return 'clinical';
  if (/tantrum|toddler|hitting|biting|meltdown/i.test(s)) return 'toddler';
  if (/crying baby|baby cries|baby crying|newborn|colic|feeding|nappy/i.test(s)) return 'baby';
  if (/lonely|isolated|no friends|alone as a dad/i.test(s)) return 'lonely';
  if (/partner|wife|spouse|mother|mum|mom/i.test(s) && /help|support|exhaust|tired|need/i.test(s)) return 'partner';
  if (/chores|mental load|housework|laundry|unfair|division|argu|responsibilit|family load/i.test(s)) return 'load';
  if (/overwhelm|burnt out|burned out|too much|can't cope|exhaust|stressed/i.test(s)) return 'overwhelmed';
  return 'ambiguous';
}

export function guideFor(text) {
  const kind = classify(text);
  if (kind === 'urgent') return { kind, response: 'I’m sorry this feels so intense. If you or your child may be in immediate danger, call 112 now. Put your child somewhere safe, move away from anything you could use to hurt yourself or them, and contact a trusted person. In the Netherlands, 113 Zelfmoordpreventie is available at 113 or 0800-0113 for suicidal thoughts.', sources: [], action: null };
  if (kind === 'clinical') return { kind, response: 'I can help you think through what to ask, but a clinician is the right person for medical or mental health advice. If this is urgent, call 112. Otherwise contact your huisarts or your child’s healthcare provider. What is worrying you most right now?', sources: [], action: null };
  if (kind === 'ambiguous') return { kind, response: 'I’m here. What feels hardest right now: your child’s needs, the load at home, or how you’re feeling?', sources: [], action: null };
  return { kind, ...guides[kind], sources: guides[kind].sources || [] };
}

export function nextDue(iso, recurrence) {
  const d = new Date(iso);
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}
