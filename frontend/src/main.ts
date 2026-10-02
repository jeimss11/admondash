import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Angular does not bundle locale data automatically. The administrative UI
// formats COP and dates with es-CO, so register it before any component renders.
registerLocaleData(localeEsCo);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
