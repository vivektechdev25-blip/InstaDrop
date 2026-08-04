export interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  return <div role="status">{message}</div>;
}
