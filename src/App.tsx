import React, { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { CaseList } from './components/Cases/CaseList';
import { Placeholder } from './components/Placeholder';
import { Case, ApiCaseResponse } from './types';
import { transformApiResponseToCase } from './utils/apiTransform';
import {
  CheckSquare,
  FileText,
  BarChart3,
  Gavel,
  Bell,
  Mic
} from 'lucide-react';

function App() {
  const [activeView, setActiveView] = useState('cases');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [cases, setCases] = useState<Case[]>([]);

  const handleCaseClick = (caseId: string) => {
    setSelectedCaseId(caseId);
    console.log('Case clicked:', caseId);
  };

  const handleCaseFound = (apiResponse: ApiCaseResponse) => {
    const newCase = transformApiResponseToCase(apiResponse);
    setCases(prevCases => {
      const existingIndex = prevCases.findIndex(c => c.id === newCase.id);
      if (existingIndex >= 0) {
        const updated = [...prevCases];
        updated[existingIndex] = newCase;
        return updated;
      }
      return [...prevCases, newCase];
    });
  };

  const renderView = () => {
    switch (activeView) {
      case 'cases':
        return <CaseList cases={cases} onCaseClick={handleCaseClick} onCaseFound={handleCaseFound} />;
      case 'tasks':
        return (
          <Placeholder
            icon={CheckSquare}
            title="Tasks & Deadlines"
            description="Task management and deadline tracking will be available soon. This feature will help you manage all case-related tasks and never miss a deadline."
          />
        );
      case 'documents':
        return (
          <Placeholder
            icon={FileText}
            title="Documents"
            description="Document management with AI-powered analysis coming soon. Upload and manage office reports, paper books, and court orders."
          />
        );
      case 'analytics':
        return (
          <Placeholder
            icon={BarChart3}
            title="AI Analysis Hub"
            description="AI-driven case analysis and strategic insights will be available here. Get intelligent recommendations based on judge history and case patterns."
          />
        );
      case 'service':
        return (
          <Placeholder
            icon={Gavel}
            title="Service Status"
            description="Track service status and case progress timeline. Monitor filing status and receive alerts for pending services."
          />
        );
      case 'notifications':
        return (
          <Placeholder
            icon={Bell}
            title="Notifications"
            description="All your case notifications, alerts, and reminders will appear here. Stay updated on deadlines and important events."
          />
        );
      case 'voice':
        return (
          <Placeholder
            icon={Mic}
            title="Voice Notes"
            description="Record voice notes for case discussions. AI will transcribe and categorize them into actionable insights and tasks."
          />
        );
      default:
        return <CaseList cases={cases} onCaseClick={handleCaseClick} onCaseFound={handleCaseFound} />;
    }
  };

  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            {renderView()}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
