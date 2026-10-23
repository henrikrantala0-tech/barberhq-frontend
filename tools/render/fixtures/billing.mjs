// tools/render/fixtures/billing.mjs — ÉN billing-mock for render-testene (19.10.2026).
//
// Samme form som backendens buildBillingShape (barberhq-backend src/lib/billingShape.js, prismodellen
// 09.10.2026). Dashbordet avviser et svar uten page_status + effective_plan + effective_plan_grunn
// (erBillingShape), og da laster billing ALDRI: Konto viser «Abonnementsstatus utilgjengelig», Vekst-flatene
// står låst (fail-closed), lenke-blokka tegnes ikke og fokusmodus starter ikke. Tester med håndskrevne
// billing-objekter passerte derfor «ved et uhell» eller feilet stille. Bruk ALLTID en av presetene her —
// ikke et eget objekt — og overstyr bare feltene testen handler om.
//
//   gratis()   Gratis (internt 'basis'), ingen abonnement. effective_plan_grunn 'gratis'.
//   prove()    Vekst i prøveperiode (effective_plan_grunn 'trial_vindu', trial_days_left 12).
//   vekst()    Vekst-abonnement (subscription_status 'active', plan 'vekst', grunn 'subscription').
//   pastDue()  Vekst med feilet betaling (past_due, needs_attention + attention_grunn).
//   billing()  rå: base + overstyringer, uten preset.
//
// page_status er 'live' som standard — send {page_status:'forhandsvist'} der testen trenger det.
// sms_pakke_kan_kjopes følger grunnen (kun 'gratis'), som i backend, med mindre den overstyres.

export const SMS_PAKKER = [
  { antall: 100, pris_kr: 129, per_sms_kr: 1.29 },
  { antall: 250, pris_kr: 279, per_sms_kr: 1.12 },
  { antall: 500, pris_kr: 495, per_sms_kr: 0.99 },
];

export const dagerFraNaa = n => new Date(Date.now() + n * 864e5).toISOString();

function base() {
  return {
    subscription_status: null,
    trial_ends_at: null,
    page_status: 'live',
    days_left: null,
    trial_start_at: null,
    trial_days_left: null,
    needs_attention: false,
    attention_grunn: null,
    plan: null,
    effective_plan: 'basis',
    effective_plan_grunn: 'gratis',
    cancel_at_period_end: false,
    current_period_end: null,
    sms_saldo: 0,
    sms_paaminnelse_enabled: false,
    sms_paaminnelser_sendes: false,
    sms_pakker: SMS_PAKKER.map(p => ({ ...p })),
    sms_pakke_kan_kjopes: true,
    sms_tilbud_avvist_at: null,
    sms_paaminnelse_eksempel: 'Hei Ola! Minner om timen din hos Grand Barber i morgen kl. 14:00.',
    plakater_doede: false,
    // Første gang siden ble synlig (null = aldri publisert).
    publisert_at: null,
  };
}

export function billing(over = {}) {
  const b = { ...base(), ...over };
  if (!('sms_pakke_kan_kjopes' in over)) b.sms_pakke_kan_kjopes = b.effective_plan_grunn === 'gratis';
  return b;
}

export const gratis = (over = {}) => billing(over);

export const prove = (over = {}) => billing({
  effective_plan: 'vekst', effective_plan_grunn: 'trial_vindu',
  trial_days_left: 12, trial_start_at: dagerFraNaa(-18),
  ...over,
});

// Publisert barber (live, publisert_at satt), Gratis-plan. Navnet er fra da Din side hadde to maler.
// For oppsettet (ikke live): v2({ page_status: 'forhandsvist', publisert_at: null }).
export const v2 = (over = {}) => billing({ page_status: 'live', publisert_at: dagerFraNaa(-3), ...over });

export const vekst = (over = {}) => billing({
  subscription_status: 'active', plan: 'vekst',
  effective_plan: 'vekst', effective_plan_grunn: 'subscription',
  current_period_end: dagerFraNaa(20),
  ...over,
});

export const pastDue = (over = {}) => vekst({
  subscription_status: 'past_due', needs_attention: true, attention_grunn: 'past_due',
  ...over,
});
