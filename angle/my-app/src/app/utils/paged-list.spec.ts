import { PagedList } from './paged-list';

// PagedList drives the searchable, paged tables (users, groups,
// audit log). These tests check the signals inside it stay in step.
describe('PagedList', () => {
  // 25 names: "item 01" to "item 25".
  const names = Array.from({ length: 25 }, (_, i) => 'item ' + String(i + 1).padStart(2, '0'));
  let list: PagedList<string>;

  beforeEach(() => {
    list = new PagedList<string>((item, term) => item.includes(term), 10);
    list.setItems(names);
  });

  it('shows the first page of 10 and counts the pages', () => {
    expect(list.pageItems().length).toBe(10);
    expect(list.pageItems()[0]).toBe('item 01');
    expect(list.pageCount()).toBe(3);
    expect(list.currentPage()).toBe(1);
  });

  it('moves forward and back a page', () => {
    list.next();
    expect(list.currentPage()).toBe(2);
    expect(list.pageItems()[0]).toBe('item 11');
    list.previous();
    expect(list.pageItems()[0]).toBe('item 01');
  });

  it('shows the shorter last page', () => {
    list.next();
    list.next();
    expect(list.currentPage()).toBe(3);
    expect(list.pageItems()).toEqual(['item 21', 'item 22', 'item 23', 'item 24', 'item 25']);
  });

  it('does not go past the first or last page', () => {
    list.previous();
    expect(list.currentPage()).toBe(1);
    list.next();
    list.next();
    list.next();
    list.next();
    expect(list.currentPage()).toBe(3);
  });

  it('filters by the search term, ignoring capitals and spaces around it', () => {
    list.search('  ITEM 1 ');
    // item 10 to item 19
    expect(list.filtered().length).toBe(10);
    expect(list.pageCount()).toBe(1);
  });

  it('returns to the first page when a search is made', () => {
    list.next();
    list.next();
    list.search('item 0');
    expect(list.currentPage()).toBe(1);
    expect(list.pageItems().length).toBe(9);
  });

  it('shows everything again when the search is cleared', () => {
    list.search('item 25');
    expect(list.filtered()).toEqual(['item 25']);
    list.search('');
    expect(list.filtered().length).toBe(25);
  });

  it('has one empty page when nothing matches', () => {
    list.search('no such thing');
    expect(list.filtered().length).toBe(0);
    expect(list.pageCount()).toBe(1);
    expect(list.pageItems()).toEqual([]);
  });

  it('follows the list when it is replaced', () => {
    list.next();
    list.next();
    list.setItems(['only one']);
    // Page 3 no longer exists, so the last real page is shown.
    expect(list.currentPage()).toBe(1);
    expect(list.pageItems()).toEqual(['only one']);
  });
});
