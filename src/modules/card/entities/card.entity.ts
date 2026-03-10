export class Card {
  id: number;
  title: string;
  description?: string;
  listId: number;
  order: number;
  dueDate?: Date;
  createdBy: number;
  assignedTo?: number;
  createdAt: Date;
  updatedAt: Date;
}
