const ReconnectModal = ({ visible ,goToBack}) => {
  if (!visible) return null;

  return (
    <ModalOverlay>
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '30px',
        borderRadius: '12px',
        width: '300px',
        textAlign: 'center'
      }}>
        <p style={{ color: 'white', fontSize: '16px', marginBottom: '20px' }}>
          Connection is reconfigured. Please rejoin the call.
        </p>
        <button
          onClick={
            goToBack}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            fontSize: '16px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          OK
        </button>
      </div>
    </ModalOverlay>
  );
};
 

const ModalOverlay = ({ children }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      {children}
    </div>
  );
};

export default ReconnectModal;