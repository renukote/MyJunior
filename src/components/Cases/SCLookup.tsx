import React, { useState } from 'react';
import { Search, FileText, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { ApiCaseResponse } from '../../types';

interface SCLookupProps {
  onCaseFound: (apiResponse: ApiCaseResponse) => void;
}

export const SCLookup: React.FC<SCLookupProps> = ({ onCaseFound }) => {
  const [diaryNumber, setDiaryNumber] = useState('');
  const [diaryYear, setDiaryYear] = useState(new Date().getFullYear().toString());
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!diaryNumber.trim()) {
      setError('Please enter a diary number');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await axios.get<ApiCaseResponse>(
        '/api/case',
        // Relative URL → Vite proxy forwards to https://lex-t.vercel.app
        // Fixes CORS errors on VS Code dev tunnels (devtunnels.ms)
        {
          params: {
            diary_no: diaryNumber,
            diary_year: diaryYear,
            language: 'en'
          }
        }
      );

      if (response.data.ok) {
        onCaseFound(response.data);
        setDiaryNumber('');
      } else {
        setError('Case not found. Please check the diary number and year.');
      }
    } catch (err) {
      console.error('Error fetching case:', err);

      if (axios.isAxiosError(err)) {
        if (err.response) {
          setError(`API Error: ${err.response.status} ${err.response.statusText}`);
        } else if (err.request) {
          setError('Failed to fetch case data. Please ensure the API server is running on localhost:8080.');
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="mb-6 p-6 rounded-xl backdrop-blur-md bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20">
      <div className="flex items-start space-x-4">
        <div className="p-3 rounded-lg bg-blue-500/20">
          <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Supreme Court Case Lookup
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Enter the diary number and year to fetch case details from the Supreme Court database.
          </p>

          <div className="flex space-x-3">
            <input
              type="text"
              placeholder="Diary Number (e.g., 1234)"
              value={diaryNumber}
              onChange={(e) => {
                setDiaryNumber(e.target.value);
                setError(null);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
              className="flex-1 px-4 py-2 rounded-lg backdrop-blur-md bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
            <input
              type="text"
              placeholder="Year"
              value={diaryYear}
              onChange={(e) => {
                setDiaryYear(e.target.value);
                setError(null);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
              className="w-32 px-4 py-2 rounded-lg backdrop-blur-md bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
            <button
              onClick={handleLookup}
              disabled={isSearching || !diaryNumber.trim()}
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Lookup</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-3 flex items-start space-x-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mt-3 flex items-start space-x-2 text-xs text-blue-600 dark:text-blue-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              Fetching case data from Supreme Court API. Make sure the API server is running on localhost:8080.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};