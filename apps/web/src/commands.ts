import type { LucideIcon } from 'lucide-react';
import { Archive, Sparkles, FileText, Plus, HelpCircle, Search, Settings } from 'lucide-react';

export interface SlashCommand {
  id: string;
  name: string;
  label: string;
  description: string;
  aliases: string[];
  hasArgs: boolean;
  placeholder?: string;
  icon: LucideIcon;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'clean',
    name: '/clean',
    label: '/clean',
    description: 'Arquiva a conversa atual e inicia um novo chat',
    aliases: ['/clear', '/limpar'],
    hasArgs: false,
    icon: Archive
  },
  {
    id: 'imagem',
    name: '/imagem',
    label: '/imagem <descrição>',
    description: 'Força a criação de uma imagem via IA',
    aliases: ['/image', '/img'],
    hasArgs: true,
    placeholder: 'Descreva a imagem que deseja gerar...',
    icon: Sparkles
  },
  {
    id: 'plan',
    name: '/plan',
    label: '/plan <objetivo>',
    description: 'Ativa o modo planejamento estruturado',
    aliases: ['/plano', '/planejar'],
    hasArgs: true,
    placeholder: 'Qual é o objetivo ou tarefa a ser planejada?',
    icon: FileText
  },
  {
    id: 'new',
    name: '/new',
    label: '/new',
    description: 'Inicia uma nova conversa para o agente',
    aliases: ['/novo'],
    hasArgs: false,
    icon: Plus
  },
  {
    id: 'search',
    name: '/search',
    label: '/search',
    description: 'Pesquisar mensagens e histórico',
    aliases: ['/buscar'],
    hasArgs: false,
    icon: Search
  },
  {
    id: 'settings',
    name: '/settings',
    label: '/settings',
    description: 'Abre as configurações do sistema',
    aliases: ['/config'],
    hasArgs: false,
    icon: Settings
  },
  {
    id: 'help',
    name: '/help',
    label: '/help',
    description: 'Exibe os comandos disponíveis e como usá-los',
    aliases: ['/ajuda', '/comandos'],
    hasArgs: false,
    icon: HelpCircle
  }
];

export function findMatchingCommands(query: string): SlashCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];
  
  // Extract command query up to first space
  const cmdPart = trimmed.split(/\s+/)[0];
  
  return SLASH_COMMANDS.filter(cmd => {
    if (cmd.name.startsWith(cmdPart)) return true;
    if (cmd.id.startsWith(cmdPart.replace('/', ''))) return true;
    return cmd.aliases.some(alias => alias.startsWith(cmdPart));
  });
}
