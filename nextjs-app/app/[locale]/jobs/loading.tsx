import LoadingNotice from "@/components/ui/LoadingNotice";

// Shown while the job list streams in. It is a loading state, never an empty state.
export default function JobsLoading() {
  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <LoadingNotice messageKey="jobs.loading" />
    </div>
  );
}
