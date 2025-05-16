import { useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import { signOut } from '../store/slices/authSlice';
import ModalPortal from './ModalPortal';
import Menubutton from './ui/Menubutton';
import PropTypes from 'prop-types';

const LogoutModal = ({ isOpen, onClose }) => {
  const modalRef = useRef();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleLogout = async () => {
    try {
      await dispatch(signOut()).unwrap();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 bg-black/75 flex items-center justify-center z-[9999] transition-opacity duration-200 ease-linear"
      >
        <div
          ref={modalRef}
          className="bg-neutral-900 border-2 border-neutral-700 rounded-lg shadow-xl p-6 w-[400px] max-w-[95vw] transition-all duration-200 ease-in-out"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(30%, -50%)',
            // backdropFilter: 'blur(2px)'
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">Logout Confirmation</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors w-auto bg-transparent"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          
          <div className="py-4">
            <p className="text-gray-300 mb-6">
              Are you sure you want to log out of your account? You&apos;ll need to sign in again to access your conversations.
            </p>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              {/* <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Logout
              </button> */}
              <Menubutton className="rounded-md flex items-center justify-center text-center" onClick={handleLogout}>
                <span className='text-sm font-medium'>Logout</span>
              </Menubutton>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

LogoutModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default LogoutModal;
