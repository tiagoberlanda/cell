import { Zap } from 'lucide-react';

export interface ToolCallItem {
  id: string;
  run_id: string;
  tool: string;
  args: any;
  status: string;
  result?: any;
  approval_id?: string;
  approval_status?: string;
}

const statusLabels: Record<string, string> = {
  done: 'Concluído',
  denied: 'Negado',
  uncertain: 'Resultado incerto',
  waiting_child: 'Delegado',
  executing: 'Executando',
  waiting_approval: 'Aguardando aprovação',
  waiting: 'Aguardando'
};

export function ToolActivityCard({
  calls,
  defaultOpen = false,
  title = 'Ferramentas utilizadas'
}: {
  calls: ToolCallItem[];
  defaultOpen?: boolean;
  title?: string;
}) {
  if (!calls || calls.length === 0) return null;

  return (
    <details className="activity-card" open={defaultOpen ? true : undefined}>
      <summary>
        <Zap size={14} className="activity-icon" />
        <span className="activity-title">{title}</span>
        <span className="activity-badge">{calls.length}</span>
      </summary>
      <div className="activity-content">
        {calls.map((c) => (
          <div className="tool-item" key={c.id}>
            <div className="tool-header">
              <strong className="tool-name">{c.tool}</strong>
              <small className={`tool-status ${c.status || ''}`}>
                {statusLabels[c.status] || c.status}
              </small>
            </div>
            {c.args && (
              <pre className="tool-args">
                {typeof c.args === 'string' ? c.args : JSON.stringify(c.args, null, 2)}
              </pre>
            )}
            {c.result && (
              <details className="tool-result-details">
                <summary>Ver resultado</summary>
                <pre className="tool-result">
                  {typeof c.result === 'string' ? c.result : JSON.stringify(c.result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
