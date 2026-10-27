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

// MCP tools are namespaced by connection id (mcp_<32 hex>_name); the id means nothing to the reader.
const computerTools: Record<string, string> = {
  pc_request_access: 'Acesso a pasta do computador',
  pc_list: 'Listar pasta do computador',
  pc_read: 'Ler arquivo do computador',
  pc_move: 'Mover no computador',
  pc_rename: 'Renomear no computador',
  pc_mkdir: 'Criar pasta no computador'
};
const toolLabel = (tool: string) => computerTools[tool] || tool.replace(/^mcp_[0-9a-f]{32}_/, '');

// Plain-language summary of a computer-folder action awaiting approval; null for other tools (shown as raw arguments).
export function describeApproval(tool: string, args: any): { title: string; lines: string[] } | null {
  const a = args || {};
  if (tool === 'pc_request_access') return { title: 'Permitir acesso a esta pasta do computador?', lines: [a.path, a.reason ? `Motivo: ${a.reason}` : '', 'O agente poderá listar e ler arquivos dela e das subpastas. Mover, renomear e criar pastas continuam pedindo sua aprovação.'].filter(Boolean) };
  if (tool === 'pc_move') { const moves: any[] = Array.isArray(a.moves) ? a.moves : []; return { title: moves.length === 1 ? 'Mover 1 item no computador?' : `Mover ${moves.length} itens no computador?`, lines: moves.slice(0, 50).map(m => `${m.from} → ${m.to}`).concat(moves.length > 50 ? [`… e mais ${moves.length - 50}`] : []) }; }
  if (tool === 'pc_rename') return { title: 'Renomear no computador?', lines: [`${a.path} → ${a.newName}`] };
  if (tool === 'pc_mkdir') return { title: 'Criar pasta no computador?', lines: [a.path] };
  return null;
}

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
              <strong className="tool-name" title={c.tool}>{toolLabel(c.tool)}</strong>
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
