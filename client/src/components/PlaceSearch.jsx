import React, { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../api.js';

export default function PlaceSearch({
  label,
  placeholder,
  location,
  token,
  bias,
  onSelect,
  onEdit,
}) {
  const [query, setQuery] = useState(location?.label || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selectedLabelRef = useRef(location?.label || '');

  useEffect(() => {
    if (location?.label) {
      selectedLabelRef.current = location.label;
      setQuery(location.label);
    }
  }, [location?.label]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3 || text === selectedLabelRef.current) {
      setResults([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const places = await searchPlaces(text, { token, bias, signal: controller.signal });
        setResults(places);
        if (places.length === 0) setError('No matching places found.');
      } catch (err) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(err.message || 'Place search is unavailable.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, token, bias?.lat, bias?.lng]);

  const handleChange = (event) => {
    const value = event.target.value;
    selectedLabelRef.current = '';
    setQuery(value);
    onEdit();
  };

  const handleSelect = (place) => {
    selectedLabelRef.current = place.label;
    setQuery(place.label);
    setResults([]);
    setError('');
    onSelect(place);
  };

  return (
    <div className="form-group place-search">
      <label className="form-label">{label}</label>
      <input
        className="input"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
      />
      {loading && <div className="place-search-message">Searching places...</div>}
      {error && <div className="place-search-message">{error}</div>}
      {results.length > 0 && (
        <ul className="place-search-results" role="listbox">
          {results.map((place) => (
            <li key={`${place.lat},${place.lng},${place.label}`}>
              <button
                type="button"
                role="option"
                className="place-search-option"
                onClick={() => handleSelect(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
