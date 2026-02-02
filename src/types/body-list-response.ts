
export interface BodyListResponse<T> {
  data: T[];
  size: number;
  [key: string]: any;
}
