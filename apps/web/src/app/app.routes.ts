import { Routes } from '@angular/router';

/**
 * Three views, all lazily loaded: the queue of open requests, the history of
 * approvals, and the edit view for refining a single request.
 */
export const routes: Routes = [
  {
    path: 'queue',
    title: 'Pen name requests · Nym',
    loadComponent: () => import('./features/queue/queue-page').then((m) => m.QueuePageComponent),
  },
  {
    path: 'history',
    title: 'History · Nym',
    loadComponent: () =>
      import('./features/history/history-page').then((m) => m.HistoryPageComponent),
  },
  {
    path: 'requests/:id',
    title: 'Request details · Nym',
    loadComponent: () => import('./features/edit/edit-page').then((m) => m.EditPageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'queue' },
  { path: '**', redirectTo: 'queue' },
];
