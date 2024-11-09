import axios from "axios";
import type { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { API_BASE_URL, ENDPOINTS } from "./endpoints";

interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
}

export class ApiUtils {
  private client: AxiosInstance;

  constructor(baseURL: string = "", headers: Record<string, string> = {}) {
    this.client = axios.create({
      baseURL,
      headers,
    });
  }

  async get<T = any>(
    endpoint: string,
    params: Record<string, any> = {},
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    try {
      const response = await this.client.get<T>(endpoint, {
        params,
        ...config,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async post<T = any>(
    endpoint: string,
    data: Record<string, any> = {},
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    try {
      const response = await this.client.post<T>(endpoint, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async put<T = any>(
    endpoint: string,
    data: Record<string, any> = {},
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    try {
      const response = await this.client.put<T>(endpoint, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  async delete<T = any>(
    endpoint: string,
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    try {
      const response = await this.client.delete<T>(endpoint, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  private handleError(error: AxiosError): Error {
    if (error.response) {
      console.error("Error response:", error.response.data);
      console.error("Status:", error.response.status);
      console.error("Headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }
    return error;
  }
}

// Example usage with ApiUtils:
/*
import { ApiUtils } from './index';
import { API_BASE_URL, ENDPOINTS } from './endpoints';

const api = new ApiUtils(API_BASE_URL);

interface User {
  id: number;
  name: string;
  email: string;
}

// Get user profile
const profile = await api.get<User>(ENDPOINTS.USERS.PROFILE);

// Get specific user
const userId = 123;
const user = await api.get<User>(ENDPOINTS.USERS.BY_ID(userId));

// Get post comments
const postId = 456;
const comments = await api.get(ENDPOINTS.POSTS.COMMENTS(postId));
*/
