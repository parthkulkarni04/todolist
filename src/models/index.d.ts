import { ModelInit, MutableModel, __modelMeta__, ManagedIdentifier } from "@aws-amplify/datastore";
// @ts-ignore
import { LazyLoading, LazyLoadingDisabled } from "@aws-amplify/datastore";





type EagerTask = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Task, 'id'>;
  };
  readonly id: string;
  readonly text: string;
  readonly category: string;
  readonly dueDate?: string | null;
  readonly priority: string;
  readonly completed: boolean;
  readonly owner: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyTask = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Task, 'id'>;
  };
  readonly id: string;
  readonly text: string;
  readonly category: string;
  readonly dueDate?: string | null;
  readonly priority: string;
  readonly completed: boolean;
  readonly owner: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type Task = LazyLoading extends LazyLoadingDisabled ? EagerTask : LazyTask

export declare const Task: (new (init: ModelInit<Task>) => Task) & {
  copyOf(source: Task, mutator: (draft: MutableModel<Task>) => MutableModel<Task> | void): Task;
}