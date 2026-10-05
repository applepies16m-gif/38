import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UploadService } from './upload.service';
import { environment } from '../../environments/environment';

// A stand-in file of a given type and size, without real contents.
function fakeFile(type: string, sizeInBytes: number): File {
  const file = new File(['x'], 'picture', { type });
  Object.defineProperty(file, 'size', { value: sizeInBytes });
  return file;
}

// UploadService checks an image in the browser before it is sent,
// and sends it. HttpTestingController stands in for the server, so
// no real request is made.
describe('UploadService', () => {
  let service: UploadService;
  let http: HttpTestingController;
  const twoMb = 2 * 1024 * 1024;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UploadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('accepts JPEG, PNG and GIF images', () => {
    expect(service.checkImage(fakeFile('image/jpeg', 1000))).toBe('');
    expect(service.checkImage(fakeFile('image/png', 1000))).toBe('');
    expect(service.checkImage(fakeFile('image/gif', 1000))).toBe('');
  });

  it('refuses other file types with a message', () => {
    expect(service.checkImage(fakeFile('application/pdf', 1000))).toContain('JPEG, PNG or GIF');
    expect(service.checkImage(fakeFile('image/svg+xml', 1000))).toContain('JPEG, PNG or GIF');
    expect(service.checkImage(fakeFile('', 1000))).toContain('JPEG, PNG or GIF');
  });

  it('accepts an image of exactly 2 MB and refuses one a byte larger', () => {
    expect(service.checkImage(fakeFile('image/png', twoMb))).toBe('');
    expect(service.checkImage(fakeFile('image/png', twoMb + 1))).toContain('2 MB');
  });

  it('sends the file to the upload endpoint as a form and returns the path', () => {
    let result = '';
    service.uploadImage(fakeFile('image/png', 1000)).subscribe((response) => {
      result = response.imageUrl;
    });

    const request = http.expectOne(environment.serverUrl + '/api/upload');
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    expect((request.request.body as FormData).has('image')).toBe(true);
    request.flush({ imageUrl: '/uploads/abc.png' });

    expect(result).toBe('/uploads/abc.png');
  });

  it('builds a full address from a stored path', () => {
    expect(service.fullUrl('/uploads/abc.png')).toBe(environment.serverUrl + '/uploads/abc.png');
  });
});
