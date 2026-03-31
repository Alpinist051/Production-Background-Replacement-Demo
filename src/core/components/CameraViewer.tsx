import CircularProgress from '@material-ui/core/CircularProgress'
import { createStyles, makeStyles, Theme } from '@material-ui/core/styles'
import VideocamOffIcon from '@material-ui/icons/VideocamOff'
import { SyntheticEvent, useEffect, useRef, useState } from 'react'
import { CameraPlayback } from '../helpers/cameraHelper'

type CameraViewerProps = {
  onLoad: (cameraPlayback: CameraPlayback) => void
}

function CameraViewer(props: CameraViewerProps) {
  const classes = useStyles()
  const [isLoading, setLoading] = useState(true)
  const [isCameraError, setCameraError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const videoElement = videoRef.current
    let cameraStream: MediaStream | undefined
    let isCancelled = false

    async function getCameraStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        })

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        cameraStream = stream

        if (videoElement) {
          videoElement.srcObject = stream
          videoElement.play().catch(() => {
            // Muted autoplay should work, but some browsers still reject the
            // promise until playback actually begins.
          })
        }
      } catch (error) {
        console.error('Error opening video camera.', error)
        if (!isCancelled) {
          setLoading(false)
          setCameraError(true)
        }
      }
    }

    getCameraStream()

    return () => {
      isCancelled = true
      cameraStream?.getTracks().forEach((track) => track.stop())

      if (videoElement) {
        videoElement.srcObject = null
      }
    }
  }, [])

  function handleVideoLoad(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget
    props.onLoad({
      htmlElement: video,
      width: video.videoWidth,
      height: video.videoHeight,
    })
    setLoading(false)
  }

  return (
    <div className={classes.root}>
      {isLoading && <CircularProgress />}
      {isCameraError ? (
        <VideocamOffIcon fontSize="large" />
      ) : (
        <video
          ref={videoRef}
          className={classes.cameraPlayback}
          hidden={isLoading}
          autoPlay
          playsInline
          controls={false}
          muted
          onLoadedMetadata={handleVideoLoad}
        />
      )}
    </div>
  )
}

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',

      [theme.breakpoints.down('xs')]: {
        width: 0,
        overflow: 'hidden',
      },

      [theme.breakpoints.up('sm')]: {
        flex: 1,
        borderRightWidth: 1,
        borderRightStyle: 'solid',
        borderRightColor: theme.palette.divider,
      },
    },
    cameraPlayback: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
  })
)

export default CameraViewer
