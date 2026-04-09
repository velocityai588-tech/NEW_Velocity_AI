import { DashboardScreen } from '@/components/DashboardScreen';
import { SampleDataBanner } from '@/components/SampleDataBanner';
import { StandupCard } from '@/components/StandupCard';
import { AgentSyncCard } from '@/components/AgentSyncCard';
import { BurnoutWarning } from '@/components/BurnoutWarning';
import { BriefMeCard } from '@/components/BriefMeCard';
import { DeadlineRiskPredictor } from '@/components/DeadlineRiskPredictor';
import { MoodPulseWidget } from '@/components/MoodPulse';
import { TeamBenchmarks } from '@/components/TeamBenchmarks';
import { ManagerReportCard } from '@/components/ManagerReportCard';
import { VelocityAISidebar } from '@/components/dashboard/VelocityAISidebar';
import { OnboardingContinueBanner } from '@/components/dashboard/OnboardingContinueBanner';

const DashboardPage = () => {
  return (
    <VelocityAISidebar>
      <div className="min-h-screen bg-[#FAFAF9]">
        <OnboardingContinueBanner />
        <BriefMeCard />
        <SampleDataBanner />
        <StandupCard />
        <AgentSyncCard />
        <BurnoutWarning />
        <DeadlineRiskPredictor />
        <TeamBenchmarks />
        <ManagerReportCard />
        <MoodPulseWidget />
        <DashboardScreen />
      </div>
    </VelocityAISidebar>
  );
};

export default DashboardPage;
