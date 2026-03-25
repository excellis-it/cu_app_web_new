'use client'
import { usePathname, useRouter } from 'next/navigation';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import getUser from '../helpers/getUser';
import { Token } from '@/helpers/Types/Date';
import { useAppContext } from './appContext';


const AuthContext = createContext({} as any);

export const AuthContextWrapper = ({ children }:{children:any}) => {
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<Token>(null);
    const { isLoading } = useAppContext();
    const router = useRouter();
    const path = usePathname();
    const socketRef = useRef<any>(null);
    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        isLoading(true);
        try {
            let token_: Token = localStorage.getItem('access-token');
            setToken(token_);
            let user_ = await getUser()
            
            if (user_?._id) {
                setUser(user_);
                if (path == '/signin') {
                    router.push('/');
                }
            }
            else {
                setUser(null);
                if (path != '/signin') {
                    router.push('/signin');
                }
            }
        } catch (error) {
        }
        isLoading(false);
    }
  


    const sharedStates = {
        user, setUser, checkUser,
        token, setToken,

    };


    return (
        <AuthContext.Provider value={sharedStates}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuthContext() {
    return useContext(AuthContext);
}


