import { signal, computed } from '@angular/core';

// A list that can be searched and is shown one page at a time.
// Used for the long lists in the app (users, groups, audit log).
//
// It is built on Angular signals. A signal is a value that knows
// who is reading it: when the value changes, everything that read
// it is updated automatically. "computed" makes a value worked out
// from other signals, recalculated only when one of them changes.
// So changing the search term here is enough to refresh the
// filtered list, the page count and the rows on screen, with no
// manual "please redraw" call.
export class PagedList<T> {
  // The three things that can change.
  readonly items = signal<T[]>([]);
  readonly searchTerm = signal('');
  readonly page = signal(1);

  // The items matching the search (all of them if it is empty).
  readonly filtered = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    return term ? this.items().filter(item => this.matches(item, term)) : this.items();
  });

  // How many pages the matching items fill; never fewer than one.
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));

  // The page being shown. If a search leaves fewer pages than the
  // page number asked for, the last page is shown instead.
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  // Just the rows for the current page.
  readonly pageItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  // matches decides whether an item fits a search term (the term
  // arrives already trimmed and in lower case). pageSize is how
  // many rows make a page.
  constructor(
    private matches: (item: T, term: string) => boolean,
    readonly pageSize = 10
  ) {}

  // Replaces the whole list, for example when it arrives from the
  // server.
  setItems(items: T[]): void {
    this.items.set(items);
  }

  // Sets the search term and goes back to the first page, since
  // the old page number means nothing for a different set of rows.
  search(term: string): void {
    this.searchTerm.set(term);
    this.page.set(1);
  }

  next(): void {
    this.page.set(Math.min(this.currentPage() + 1, this.pageCount()));
  }

  previous(): void {
    this.page.set(Math.max(this.currentPage() - 1, 1));
  }
}
