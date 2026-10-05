
(() => {
  const calls = [];
  window.__calls = calls;
  window.__tiers = [];
  const sample = async (input, opts = {}) => {
    window.__tiers.push(opts.modelTier);
    calls.push({ input, tools: (opts.tools || []).map(t => t.name) });
    if (opts.tools) {
      const find = opts.tools.find(t => t.name === 'find_free_slots');
      const d = new Date(); d.setDate(d.getDate() + 1);
      const p = n => String(n).padStart(2, '0');
      const day = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
      const slots = await find.execute({ from: day + ' 08:00', to: day + ' 18:00', duration_minutes: 45 }, {});
      window.__slots = slots;
      const mk = opts.tools.find(t => t.name === 'create_meeting');
      const r = await mk.execute({ title: 'Client call (AI)', start: slots[0].start, duration_minutes: 45, job_id: 'j2', platform: 'teams' }, {});
      await opts.tools.find(t => t.name === 'draft_email').execute({ to: 'fatima@alnoorlogistics.bh', subject: 'Invitation', body: 'Hello', job_id: 'Dilmun Advisory' }, {});
      let bad = null; try { await mk.execute({ title: 'x', start: 'tomorrow', duration_minutes: 30, job_id: 'j9' }, {}); } catch (e) { bad = String(e.message); }
      window.__bad = bad;
      const text = 'I booked **' + r.start + '** for **Dilmun Advisory**. It avoids your lecture and the board meeting.\n\n- Teams call, 45 minutes\n- Invitation drafted from your Dilmun Advisory email\n\nReview the draft before sending.';
      opts.onText && opts.onText({ text, delta: text });
      return { text, truncated: false, modelTierApplied: 'default' };
    }
    const text = '• [Dilmun Advisory] Send revised scope';
    opts.onText && opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: 'default' };
  };
  sample.json = async (input) => {
    calls.push({ json: true, input: String(input).slice(0, 60) });
    if (String(input).includes('Sort these emails')) return [{ id: 'nope', priority: 'skip', job: 'j1' }];
    if (String(input).includes('tender notice')) return ['Commercial registration', 'Bid bond 2%'];
    return { subject: 'Re: scope', body: 'Thank you, Fatima.\n\nBest regards,' };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 20 } });
  window.claude = { use: async (name) => name === 'sample' ? sample : null };
})();
