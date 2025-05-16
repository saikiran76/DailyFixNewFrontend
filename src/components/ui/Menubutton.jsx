import PropTypes from 'prop-types';

export const Menubutton = ({ onClick, children, className }) => {
    return(
        <button
            onClick={onClick}
            className={`w-autp bg-gradient-to-r from-purple-900/80 to-indigo-900/80 flex items-center px-2 py-2 rounded-md text-white hover:opacity-90 transition-colors ${className}`}
            >
            {children}
        </button>
    )
}

// The prop onClick handler is optional, and children is mandatory
Menubutton.propTypes = {
    onClick: PropTypes.func,
    className: PropTypes.string,
    children: PropTypes.node.isRequired,
}

export default Menubutton;
