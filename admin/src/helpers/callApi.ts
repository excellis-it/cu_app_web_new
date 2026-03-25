import axios, { CancelTokenSource } from 'axios';

export default async function callApi(url: string, parameters = {}, method = 'POST', headers= {}): Promise<APIResponse> {
  try {
    const token = localStorage.getItem('access-token') || '';
    const source = axios.CancelToken.source();
    const options = { headers: { ...headers, 'access-token': token }, cancelToken: source.token }
    
    // if (!token) throw new Error('Token not found');
    if (method === 'POST') {
      const response = await axios.post(url, parameters, options);
      if(!response) throw new Error('Response not found');
      return { cancelToken: source, statusCode: response?.status, success: response?.data?.success, data: response?.data };
    } else if (method === 'GET') {
      const response = await axios.get(url, options);
      if(!response) throw new Error('Response not found');
      return { cancelToken: source, statusCode: response?.status, success: response?.data?.success, data: response?.data };
    } else if (method === 'PUT') {
      const response = await axios.put(url, parameters, options);
      if(!response) throw new Error('Response not found');
      return { cancelToken: source, statusCode: response?.status, success: response?.data?.success, data: response?.data };
    } else if (method === 'DELETE') {
      const response = await axios.delete(url, options);
      if(!response) throw new Error('Response not found');
      return { cancelToken: source, statusCode: response?.status, success: response?.data?.success, data: response?.data };
    } else {
      throw new Error('Invalid method');
    }
  } catch (error:any) {
    
    return { cancelToken: null, statusCode: error?.response?.status, success: error?.response?.data.success, data: error?.response?.data };
  }
}

type APIResponse = {
  cancelToken: CancelTokenSource | null;
  statusCode: number;
  success: boolean;
  data: any;
};
