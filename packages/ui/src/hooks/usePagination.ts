import { useState, useMemo, useEffect } from "react";

const MAX_PAGE_BUTTONS = 5;

interface UsePaginationResult<T> {
  page: number;
  setPage: (page: number | ((prev: number) => number)) => void;
  safePage: number;
  totalPages: number;
  pagedItems: T[];
  pageNumbers: number[];
  handlePageReset: () => void;
}

export function usePagination<T>(items: T[], perPage: number): UsePaginationResult<T> {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = useMemo(
    () => items.slice((safePage - 1) * perPage, safePage * perPage),
    [items, safePage, perPage],
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    let start = Math.max(1, safePage - Math.floor(MAX_PAGE_BUTTONS / 2));
    const end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  const handlePageReset = () => setPage(1);

  return { page, setPage, safePage, totalPages, pagedItems, pageNumbers, handlePageReset };
}
