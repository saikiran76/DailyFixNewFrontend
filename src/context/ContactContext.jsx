import React, { createContext, useContext, useState } from 'react';

const ContactContext = createContext();

export const ContactProvider = ({children})=>{
  const [contacts, setContacts] = useState({});

  const updateContacts = (newContacts) => {
    setContacts(prev=>({...prev,...newContacts}));
  };

  return (
    <ContactContext.Provider value={{contacts, updateContacts}}>
      {children}
    </ContactContext.Provider>
  );
};

export const useContacts = ()=>useContext(ContactContext);
