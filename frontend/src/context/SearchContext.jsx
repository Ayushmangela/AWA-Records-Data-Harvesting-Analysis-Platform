import React, { createContext, useContext, useState, useCallback } from "react";

const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("All States");
  const [licenseTypeFilter, setLicenseTypeFilter] = useState("All Types");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All Severities");
  const [hasViolations, setHasViolations] = useState(false);
  const [sortBy, setSortBy] = useState("violations_desc");
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState([null]);
  const [nextCursor, setNextCursor] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  const resetPagination = useCallback(() => {
    setPageIndex(0);
    setCursors([null]);
    setNextCursor(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setStateFilter("All States");
    setLicenseTypeFilter("All Types");
    setSpeciesFilter("");
    setSeverityFilter("All Severities");
    setHasViolations(false);
    setSortBy("violations_desc");
    setPageIndex(0);
    setCursors([null]);
    setNextCursor(null);
    setScrollPosition(0);
  }, []);

  const value = {
    searchTerm,
    setSearchTerm,
    stateFilter,
    setStateFilter,
    licenseTypeFilter,
    setLicenseTypeFilter,
    speciesFilter,
    setSpeciesFilter,
    severityFilter,
    setSeverityFilter,
    hasViolations,
    setHasViolations,
    sortBy,
    setSortBy,
    pageIndex,
    setPageIndex,
    cursors,
    setCursors,
    nextCursor,
    setNextCursor,
    scrollPosition,
    setScrollPosition,
    resetPagination,
    clearAllFilters,
  };

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}
