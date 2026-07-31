import { PromptBuilderService, REQUESTED_CANDIDATE_COUNT } from './prompt-builder.service';

describe('PromptBuilderService', () => {
  const service = new PromptBuilderService();

  const brief = {
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: 'Anglo-Irish',
    notes: 'Literary historical fiction.',
  };

  it('states the JSON contract and refuses prose', () => {
    const prompt = service.build(brief);

    expect(prompt).toContain('Return ONLY valid JSON, no prose, no code fence.');
    expect(prompt).toContain('"candidates"');
  });

  it('carries every brief field into the prompt', () => {
    const prompt = service.build(brief);

    expect(prompt).toContain('Author legal name: Margaret E. Voss');
    expect(prompt).toContain('Pen name should read as: Female');
    expect(prompt).toContain('Language / cultural origin to lean on: Anglo-Irish');
    expect(prompt).toContain('Editorial notes: Literary historical fiction.');
  });

  it('omits optional lines when the brief leaves them empty', () => {
    const prompt = service.build({ ...brief, origin: '', notes: '' });

    expect(prompt).not.toContain('Language / cultural origin');
    expect(prompt).not.toContain('Editorial notes');
  });

  it('lists only the whole words of the legal name as things to avoid', () => {
    const prompt = service.build(brief);

    expect(prompt).toContain('any part of: Margaret, Voss');
  });

  it('asks for more candidates than it keeps, so screening has slack', () => {
    expect(service.build(brief)).toContain(`Produce ${REQUESTED_CANDIDATE_COUNT} candidates`);
  });

  it('requires a middle initial on every candidate', () => {
    const prompt = service.build(brief);

    expect(prompt).toContain('Never omit the middle initial.');
    expect(prompt).toContain('The middle initial must not match any initial of the legal name.');
  });

  it('carries the safety guardrails', () => {
    const prompt = service.build(brief);

    expect(prompt).toContain('offensive, obscene, slurs, or vulgar in any language');
    expect(prompt).toContain('near-miss a famous name by one letter or a homophone');
    expect(prompt).toContain('religious or sacred figures');
    expect(prompt).toContain('Do not appropriate a cultural or ethnic identity');
  });

  it('includes the refinement only on a regeneration pass', () => {
    expect(service.build(brief, { refine: 'shorter surnames' })).toContain(
      'Refinement for this pass: shorter surnames',
    );
    expect(service.build(brief)).not.toContain('Refinement for this pass');
  });

  it('tells the model not to repeat locked names but to match their register', () => {
    const prompt = service.build(brief, { lockedNames: ['Bridget C. ASHWORTH'] });

    expect(prompt).toContain('Names already locked (do NOT repeat, but match their register)');
    expect(prompt).toContain('Bridget C. ASHWORTH');
  });
});
