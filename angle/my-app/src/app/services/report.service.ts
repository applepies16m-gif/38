import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Report } from '../models/report.model';
import { environment } from '../../environments/environment';

const API_URL = `${environment.serverUrl}/api/reports`;

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  constructor(private http: HttpClient) {}

  // Every report, newest first (the Super Admin's view).
  getReports(): Observable<Report[]> {
    return this.http.get<Report[]>(API_URL);
  }

  // Only the reports made in one group (a Group Admin's view).
  getReportsForGroup(groupId: string): Observable<Report[]> {
    return this.http.get<Report[]>(API_URL, { params: { groupId } });
  }

  // Sends a new report about a user, with a reason.
  submitReport(report: Partial<Report>): Observable<Report> {
    return this.http.post<Report>(API_URL, report);
  }

  // Records the Super Admin's decision on a report.
  decideReport(
    id: string,
    status: 'resolved' | 'dismissed',
    decisionNote: string,
  ): Observable<void> {
    return this.http.put<void>(`${API_URL}/${id}`, { status, decisionNote });
  }
}
