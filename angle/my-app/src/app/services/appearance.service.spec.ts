import { AppearanceService, DEFAULT_APPEARANCE, darkeningForHue } from './appearance.service';

// AppearanceService turns a user's two slider values into CSS
// variables on the page.
describe('AppearanceService', () => {
  let service: AppearanceService;
  const root = document.documentElement;

  beforeEach(() => {
    service = new AppearanceService();
    service.apply(null);
  });

  describe('clean', () => {
    it('gives the standard look when nothing is stored', () => {
      expect(service.clean(undefined)).toEqual(DEFAULT_APPEARANCE);
      expect(service.clean(null)).toEqual(DEFAULT_APPEARANCE);
    });

    it('keeps values that are in range', () => {
      expect(service.clean({ textScale: 120, hue: 300 })).toEqual({ textScale: 120, hue: 300 });
    });

    it('replaces out-of-range or non-number values with the standard ones', () => {
      expect(service.clean({ textScale: 500, hue: -20 })).toEqual(DEFAULT_APPEARANCE);
      expect(service.clean({ textScale: 'big' as any, hue: NaN })).toEqual(DEFAULT_APPEARANCE);
    });

    it('fills in whichever value is missing', () => {
      expect(service.clean({ hue: 10 })).toEqual({ textScale: DEFAULT_APPEARANCE.textScale, hue: 10 });
    });
  });

  describe('apply', () => {
    it('sets the colour variables for a chosen hue', () => {
      service.apply({ textScale: 100, hue: 300 });
      expect(root.style.getPropertyValue('--chrome-blue')).toContain('hsl(300');
      expect(root.style.getPropertyValue('--chrome-blue-dark')).toContain('hsl(300');
      expect(root.style.getPropertyValue('--panel-border')).toContain('hsl(300');
    });

    it('removes the overrides at the standard hue, so the stylesheet colours are used', () => {
      service.apply({ textScale: 100, hue: 300 });
      service.apply(DEFAULT_APPEARANCE);
      expect(root.style.getPropertyValue('--chrome-blue')).toBe('');
    });

    it('puts the standard look back when given nothing, as on logout', () => {
      service.apply({ textScale: 130, hue: 40 });
      service.apply(null);
      expect(root.style.getPropertyValue('--chrome-blue')).toBe('');
    });
  });

  describe('darkeningForHue', () => {
    it('leaves the standard blue alone', () => {
      expect(darkeningForHue(DEFAULT_APPEARANCE.hue)).toBe(0);
    });

    it('darkens yellow, which is too bright for white text', () => {
      expect(darkeningForHue(60)).toBeGreaterThan(0);
    });

    it('never darkens by more than the shade has to give', () => {
      for (let hue = 0; hue <= 360; hue += 15) {
        expect(darkeningForHue(hue)).toBeLessThan(50);
      }
    });
  });
});
