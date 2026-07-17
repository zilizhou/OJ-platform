import { useParams } from 'react-router-dom';
import SubmissionDetailPanel from '../components/SubmissionDetailPanel';

export default function SubmissionDetail() {
  const { id } = useParams();
  if (!id) return null;
  return <SubmissionDetailPanel submissionId={Number(id)} />;
}
