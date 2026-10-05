import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const SERVER_URL = environment.serverUrl;

// The same limits the server enforces. Checking here first gives
// the user an answer without uploading the file.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  constructor(private http: HttpClient) {}

  // Returns the reason a file can't be used as an image, or an
  // empty string if it is acceptable.
  checkImage(file: File): string {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'Choose a JPEG, PNG or GIF image.';
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return 'Images must be 2 MB or smaller.';
    }
    return '';
  }

  // Sends the file to the server, which saves it and answers with
  // the short path to store, e.g. "/uploads/3f9a...c2.png".
  uploadImage(file: File): Observable<{ imageUrl: string }> {
    const form = new FormData();
    form.append('image', file);
    return this.http.post<{ imageUrl: string }>(`${SERVER_URL}/api/upload`, form);
  }

  // Turns a stored path into a full address an <img> can load.
  fullUrl(imageUrl: string): string {
    return SERVER_URL + imageUrl;
  }
}
