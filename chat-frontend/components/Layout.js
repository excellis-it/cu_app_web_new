import React from 'react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { location, user } from '../../redux/reducer/appEssentials';
import useWindowSize from '@rooks/use-window-size';
import { PROXY } from '../../config';
import axios from 'axios';

const Layout = ({ children }) => {
  const router = useRouter();
  const {
    innerWidth: windowWidth,
    innerHeight,
    outerHeight,
    outerWidth,
  } = useWindowSize();

  const [showLayout, setShowLayout] = useState(false);
  const path = router?.pathname.split('/');
  const dispatch = useDispatch();
  const checkSession = async () => {
    let user12;
    if (localStorage.getItem('wedcell') !== '') {
      user12 = JSON.parse(localStorage.getItem('wedcell'));
    }
    if (user12) {
      const res = await axios.get(`${PROXY}`, {
        headers: {
          authorization: user12?.data?.token,
        },
      });
      if (res.data.success === false) {
        dispatch(user(undefined));
        localStorage.removeItem('wedcell');
        localStorage.removeItem('wedcellIsLoged');
        localStorage.removeItem('role');
      }
    } else {
      dispatch(user(undefined));
    }
  };
  useEffect(() => {
    checkSession();
    if (localStorage.getItem('wedcell') !== '') {
      dispatch(user(JSON.parse(localStorage.getItem('wedcell'))));
    }
    dispatch(location(localStorage.getItem('location')));
    const listenStorageChange = () => {
      if (localStorage.getItem('location') === null) {
        dispatch(location(''));
      } else {
        dispatch(location(localStorage.getItem('location')));
      }
    };
    window.addEventListener('location', listenStorageChange);
  }, []);
  useEffect(() => {
    if (
      path.some((path) => path === 'dashboard') ||
      router?.pathname === '/student/profile' ||
      router?.pathname === '/InvitationCard'
    ) {
      setShowLayout(false);
    } else {
      setShowLayout(true);
    }
  }, [path]);

  return (
    <>
      {children}
    </>
  );
};

export default Layout;
