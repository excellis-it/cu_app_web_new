'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAppContext } from '@/context/appContext';
import { useAuthContext } from '@/context/authContext';


const useApi = (url:string, parameters = {}, method = 'POST', call = true) => {
  const [data, setData] = useState<any>({});
  const [error, setError] = useState(null);
  const [params, setParams] = useState(parameters);
  const [refreshIndex, setRefreshIndex] = useState(0); 
  const { user, token } = useAuthContext();
  const { isLoading } = useAppContext();
  const refresh = () => {
    setRefreshIndex((state) => state + 1);
  };

  const fetchData = useCallback(async () => {
    if(!token || !user) return;
    let source = axios.CancelToken.source();
    
    isLoading(true);    
    try {
      
      let response;
      if (method === 'GET') {
        response = await axios.get(url, { headers:{'access-token': token}, cancelToken: source.token });
      } else if (method === 'POST') {
        response = await axios.post(url, params, {
          headers: { 'access-token': token },
          cancelToken: source.token,
        });        
      } else {
        throw new Error('Invalid HTTP method');
      }

      if (response.data.success) {
        setData(response.data);
        setError(null);
      } else {
        setError(response.data.error || response.data.message);
        setData({});
      }

    } catch (error:any) {
      if (!axios.isCancel(error)) {
        setError(error);
      }
    } finally {
    }
    
    isLoading(false);
    return () => {
      source.cancel('Request canceled by cleanup');
    };
  }, [url, params, method, token, refreshIndex,user]);

  useEffect(() => {    
    if(JSON.stringify(params) !== JSON.stringify(parameters)) {
      setParams(parameters);
    }
  }, [parameters]);

  useEffect(() => {
    if (call) fetchData();
  }, [fetchData, call]);

  return { data, error, refresh };
};

export default useApi;
