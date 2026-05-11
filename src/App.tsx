/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import axios from 'axios';
import { auth, db, provider } from './firebase';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function App() {
  const [pages, setPages] = useState<string[]>([]);
  const [multiPageUrls, setMultiPageUrls] = useState<string>('');
  const [trackingUrls, setTrackingUrls] = useState<string>('');
  const [results, setResults] = useState<{ url: string; status: string; foundUrls: string[]; statusCode?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'user_trackers', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTrackingUrls(docSnap.data().urls.join('\n'));
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const saveToFirestore = async (urls: string) => {
    if (user) {
      const docRef = doc(db, 'user_trackers', user.uid);
      await setDoc(docRef, { uid: user.uid, urls: urls.split('\n').filter(Boolean) });
    }
  };

  const handleTrackingUrlsChange = (val: string) => {
    setTrackingUrls(val);
    saveToFirestore(val);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        complete: (results) => {
          const pageUrls = results.data.map((row: any) => row[0]).filter(Boolean);
          setPages(prev => [...prev, ...pageUrls]);
        }
      });
    }
  };

  const addMultiplePages = () => {
    const newUrls = multiPageUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (newUrls.length > 0) {
      setPages(prev => [...prev, ...newUrls]);
      setMultiPageUrls('');
    }
  };

  const checkUrls = async () => {
    setLoading(true);
    setProgress(0);
    setResults([]);
    const urlsToCheck = trackingUrls.split('\n').filter(Boolean);
    const CONCURRENCY_LIMIT = 5;
    
    let processedCount = 0;
    const totalCount = pages.length;
    let allResults: { url: string; status: string; foundUrls: string[] }[] = [];

    const processBatch = async (batch: string[]) => {
      const batchResults = await Promise.all(batch.map(async (pageUrl) => {
        try {
          const response = await axios.post('/api/check-urls', { pageUrl, trackingUrls: urlsToCheck });
          return {
            url: pageUrl,
            status: response.data.present ? 'Present' : 'Not Present',
            foundUrls: response.data.foundUrls,
            statusCode: 200
          };
        } catch (error: any) {
          return { 
            url: pageUrl, 
            status: 'Error', 
            foundUrls: [],
            statusCode: error.response?.data?.statusCode || 500
          };
        }
      }));
      return batchResults;
    };

    for (let i = 0; i < totalCount; i += CONCURRENCY_LIMIT) {
      const batch = pages.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await processBatch(batch);
      allResults = [...allResults, ...batchResults];
      setResults([...allResults]);
      processedCount += batch.length;
      setProgress(Math.round((processedCount / totalCount) * 100));
    }
    setLoading(false);
  };

  const exportResults = () => {
    const csv = Papa.unparse(results.map(r => ({
      Page: r.url,
      Status: r.status,
      'Status Code': r.statusCode,
      'Found URLs': r.foundUrls.join('; ')
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tracking_urls_results.csv';
    a.click();
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Tracking URL Detector</h1>
      
      {user ? (
        <div className="text-sm">Logged in as {user.email}</div>
      ) : (
        <button onClick={() => signInWithPopup(auth, provider)} className="px-4 py-2 bg-slate-800 text-white rounded-md">Login with Google</button>
      )}
      
      <div className="bg-blue-50 p-4 rounded-md border border-blue-200 text-sm text-blue-800">
        <p><strong>Note:</strong> This tool detects tracking URLs present in the <em>initial server-side HTML source code</em> ("manually added"). It does not detect URLs added dynamically by client-side JavaScript after page load.</p>
      </div>
      
      <div className="space-y-4">
        <label className="block text-sm font-medium">Add pages (one URL per line):</label>
        <div className="flex gap-2">
          <textarea 
            value={multiPageUrls}
            onChange={(e) => setMultiPageUrls(e.target.value)}
            className="flex-grow p-2 border border-slate-300 rounded-md h-20"
            placeholder="https://example.com&#10;https://another.com"
          />
          <button onClick={addMultiplePages} className="px-4 py-2 bg-slate-200 rounded-md hover:bg-slate-300">Add</button>
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium">Or upload CSV of pages (one URL per row):</label>
        <input type="file" onChange={handleFileChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Enter tracking URLs (one per line):</label>
        <textarea 
          value={trackingUrls}
          onChange={(e) => handleTrackingUrlsChange(e.target.value)}
          className="w-full h-32 p-2 border border-slate-300 rounded-md"
          placeholder="Enter tracking URLs here (one per line). These will be automatically saved in your browser for future sessions."
        />
      </div>

      <div className="flex gap-4">
        <button 
          onClick={checkUrls}
          disabled={loading || pages.length === 0 || !trackingUrls}
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-slate-300"
        >
          {loading ? `Checking... ${progress}%` : 'Check URLs'}
        </button>
        
        {results.length > 0 && (
          <button 
            onClick={exportResults}
            className="px-4 py-2 bg-green-600 text-white rounded-md"
          >
            Export All to CSV
          </button>
        )}
      </div>

      {loading && (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {results.length > 0 && (
        <table className="w-full border-collapse border border-slate-200">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-200 p-2 text-left">Page</th>
              <th className="border border-slate-200 p-2 text-left">Status</th>
              <th className="border border-slate-200 p-2 text-left">Status Code</th>
              <th className="border border-slate-200 p-2 text-left">Found URLs</th>
            </tr>
          </thead>
          <tbody>
            {results.map((res, i) => (
              <tr key={i}>
                <td className="border border-slate-200 p-2">{res.url}</td>
                <td className={`border border-slate-200 p-2 font-bold ${res.status === 'Present' ? 'text-green-600' : res.status === 'Not Present' ? 'text-slate-600' : 'text-red-600'}`}>{res.status}</td>
                <td className="border border-slate-200 p-2 font-mono">{res.statusCode}</td>
                <td className="border border-slate-200 p-2">{res.foundUrls.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
