export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiErrorShape = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorShape;
