import { HashRouter, Routes, Route } from 'react-router-dom';
import { MinimalShell } from '../components/layout/MinimalShell';
import { HomePage } from '../pages/HomePage';
import { ReviewModePage } from '../pages/ReviewModePage';
import { EyeTrackingReviewPage } from '../pages/EyeTrackingReviewPage';
import { CodeAssemblyHandReviewPage } from '../pages/CodeAssemblyHandReviewPage';
import { ProblemsPage } from '../pages/ProblemsPage';
import { ProblemSolvePage } from '../pages/ProblemSolvePage';

export function AppRouter() {
  return (
    <HashRouter>
      <MinimalShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/review" element={<ReviewModePage />} />
          <Route path="/review-eye" element={<EyeTrackingReviewPage />} />
          <Route path="/code-assembly" element={<CodeAssemblyHandReviewPage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:id" element={<ProblemSolvePage />} />
        </Routes>
      </MinimalShell>
    </HashRouter>
  );
}
