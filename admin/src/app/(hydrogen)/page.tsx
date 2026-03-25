import { metaObject } from '@/config/site.config';
import AnalyticsDashboard from '../shared/analytics-dashboard';

export const metadata = {
  ...metaObject(),
};

export default function FileDashboardPage() {
  return <AnalyticsDashboard />;
}
