import {
  ApprovePayload,
  BulkApproveResultDto,
  CreateRequestPayload,
  CurrentUserDto,
  GenerateRequestPayload,
  PenNameRequestDto,
  PromptSettingsDto,
  RequestListDto,
  SuiteAppDto,
  UpdatePromptSettingsPayload,
  UpdateRequestPayload,
} from '@nym/shared';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from './api.tokens';

export interface ListRequestsQuery {
  view?: 'queue' | 'history' | 'all';
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * Thin, fully typed transport over the Nym API.
 *
 * It contains no application logic — state lives in the stores — so it stays
 * trivial to stub in component tests.
 */
@Injectable({ providedIn: 'root' })
export class NymApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listRequests(query: ListRequestsQuery = {}): Observable<RequestListDto> {
    let params = new HttpParams();
    if (query.view) {
      params = params.set('view', query.view);
    }
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.limit !== undefined) {
      params = params.set('limit', String(query.limit));
    }
    if (query.offset !== undefined) {
      params = params.set('offset', String(query.offset));
    }
    return this.http.get<RequestListDto>(`${this.baseUrl}/requests`, { params });
  }

  getRequest(id: string): Observable<PenNameRequestDto> {
    return this.http.get<PenNameRequestDto>(`${this.baseUrl}/requests/${id}`);
  }

  createRequest(payload: CreateRequestPayload): Observable<PenNameRequestDto> {
    return this.http.post<PenNameRequestDto>(`${this.baseUrl}/requests`, payload);
  }

  updateRequest(id: string, payload: UpdateRequestPayload): Observable<PenNameRequestDto> {
    return this.http.patch<PenNameRequestDto>(`${this.baseUrl}/requests/${id}`, payload);
  }

  deleteRequest(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/requests/${id}`);
  }

  generate(id: string, payload: GenerateRequestPayload = {}): Observable<PenNameRequestDto> {
    return this.http.post<PenNameRequestDto>(`${this.baseUrl}/requests/${id}/generate`, payload);
  }

  chooseCandidate(id: string, penName: string): Observable<PenNameRequestDto> {
    return this.http.post<PenNameRequestDto>(`${this.baseUrl}/requests/${id}/choose`, { penName });
  }

  toggleLock(id: string, candidateId: string, locked: boolean): Observable<PenNameRequestDto> {
    return this.http.patch<PenNameRequestDto>(
      `${this.baseUrl}/requests/${id}/candidates/${candidateId}/lock`,
      { locked },
    );
  }

  approve(id: string, payload: ApprovePayload = {}): Observable<PenNameRequestDto> {
    return this.http.post<PenNameRequestDto>(`${this.baseUrl}/requests/${id}/approve`, payload);
  }

  approveAll(): Observable<BulkApproveResultDto> {
    return this.http.post<BulkApproveResultDto>(`${this.baseUrl}/requests/approve-all`, {});
  }

  reopen(id: string): Observable<PenNameRequestDto> {
    return this.http.post<PenNameRequestDto>(`${this.baseUrl}/requests/${id}/reopen`, {});
  }

  getPromptSettings(id: string): Observable<PromptSettingsDto> {
    return this.http.get<PromptSettingsDto>(`${this.baseUrl}/requests/${id}/prompt`);
  }

  updatePromptSettings(
    id: string,
    payload: UpdatePromptSettingsPayload,
  ): Observable<PromptSettingsDto> {
    return this.http.patch<PromptSettingsDto>(`${this.baseUrl}/requests/${id}/prompt`, payload);
  }

  resetPromptSettings(id: string): Observable<PromptSettingsDto> {
    return this.http.delete<PromptSettingsDto>(`${this.baseUrl}/requests/${id}/prompt`);
  }

  getCurrentUser(): Observable<CurrentUserDto> {
    return this.http.get<CurrentUserDto>(`${this.baseUrl}/auth/me`);
  }

  getSuiteApps(): Observable<SuiteAppDto[]> {
    return this.http.get<SuiteAppDto[]>(`${this.baseUrl}/auth/apps`);
  }
}
