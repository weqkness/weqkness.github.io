import { useEffect, useState } from 'react';
import RuneCalculatorPanel from './features/rune-calculator/RuneCalculatorPanel';
import type { MarksData, Scales } from './types';

interface LoadingState {
  marks: 'loading' | 'loaded' | 'error';
  scales: 'loading' | 'loaded' | 'error';
}

interface ErrorState {
  marks: string | null;
  scales: string | null;
}

const dataUrl = (fileName: string, envOverride?: string) => (
  envOverride || `${import.meta.env.BASE_URL}${fileName}`
);

function App() {
  const [marksData, setMarksData] = useState<MarksData | null>(null);
  const [scalesData, setScalesData] = useState<Scales | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    marks: 'loading',
    scales: 'loading'
  });
  const [errors, setErrors] = useState<ErrorState>({
    marks: null,
    scales: null
  });

  useEffect(() => {
    async function loadData() {
      const marksUrl = dataUrl('marks.json', import.meta.env.VITE_MARKS_URL);
      const scalesUrl = dataUrl('scales.json', import.meta.env.VITE_SCALES_URL);

      try {
        const marksResponse = await fetch(marksUrl);
        if (!marksResponse.ok) {
          throw new Error(`Failed to load marks: ${marksResponse.status} ${marksResponse.statusText}`);
        }
        const marks: MarksData = await marksResponse.json();
        setMarksData(marks);
        setLoading(prev => ({ ...prev, marks: 'loaded' }));
      } catch (error) {
        console.error('Error loading marks:', error);
        setErrors(prev => ({ ...prev, marks: error instanceof Error ? error.message : 'Failed to load marks data' }));
        setLoading(prev => ({ ...prev, marks: 'error' }));
      }

      try {
        const scalesResponse = await fetch(scalesUrl);
        if (!scalesResponse.ok) {
          throw new Error(`Failed to load scales: ${scalesResponse.status} ${scalesResponse.statusText}`);
        }
        const scales: Scales = await scalesResponse.json();
        setScalesData(scales);
        setLoading(prev => ({ ...prev, scales: 'loaded' }));
      } catch (error) {
        console.error('Error loading scales:', error);
        setErrors(prev => ({ ...prev, scales: error instanceof Error ? error.message : 'Failed to load scales data' }));
        setLoading(prev => ({ ...prev, scales: 'error' }));
      }
    }

    loadData();
  }, []);

  if (loading.marks === 'loading' || loading.scales === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-700 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-300">Loading mark calculator...</p>
        </div>
      </div>
    );
  }

  if (loading.marks === 'error' || loading.scales === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3 text-red-800 dark:text-red-200">Failed to Load Data</h2>
            {errors.marks && <p className="mb-2 text-red-700 dark:text-red-300">Marks: {errors.marks}</p>}
            {errors.scales && <p className="mb-2 text-red-700 dark:text-red-300">Scales: {errors.scales}</p>}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (marksData && scalesData) {
    return (
      <RuneCalculatorPanel
        marksData={marksData}
        scales={scalesData}
        initialMarkSpeed="1"
        initialMarkBulk="1"
        initialMarkLuck="1"
        initialMarkClone="1"
      />
    );
  }

  return null;
}

export default App;
