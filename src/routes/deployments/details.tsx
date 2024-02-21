import { useSnackbar } from 'notistack'
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  GetDeploymentQuery,
  PowerState,
  useDeploymentNodePowerMutation,
  useGetDeploymentQuery,
} from '@/lib/api/generated'
import {
  Container,
  Typography,
  Divider,
  LinearProgress,
  Box,
  Menu,
  MenuItem,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Grid,
  ListItemIcon,
  CircularProgress,
  Stack,
} from '@mui/material'
import {
  ChevronLeft,
  ExpandMore,
  MonitorTwoTone,
  MoreHoriz,
  Power,
  PowerOff,
  PowerTwoTone,
  RestartAlt,
} from '@mui/icons-material'
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  Edge,
  Handle,
  Node,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import Dagre from '@dagrejs/dagre'

import 'reactflow/dist/style.css'

const dagreGraph = new Dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

const nodeWidth = 172
const nodeHeight = 36

const getLayoutedElements = (
  nodes: Node<GetDeploymentQuery['deployment']['deploymentNodes'][number]>[],
  edges: Edge[],
  options: { direction: 'TB' | 'BT' | 'LR' | 'RL' }
) => {
  const isHorizontal = options.direction === 'LR' || options.direction === 'RL'
  dagreGraph.setGraph({
    rankdir: options.direction,
    nodesep: nodeWidth / 2,
    edgesep: 25,
  })

  nodes.forEach((node) =>
    dagreGraph.setNode(node.id, {
      ...node,
      width: nodeWidth,
      height: nodeHeight,
    })
  )
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target))

  Dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.targetPosition = isHorizontal ? Position.Left : Position.Top
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom

    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    }

    return node
  })

  return { nodes, edges }
}

function generateFlowData(
  deploymentNodes: GetDeploymentQuery['deployment']['deploymentNodes']
): {
  nodes: Node<GetDeploymentQuery['deployment']['deploymentNodes'][number]>[]
  edges: Edge[]
} {
  const nodes: Node<
    GetDeploymentQuery['deployment']['deploymentNodes'][number]
  >[] = []
  const edges: Edge[] = []

  for (let i = 0; i < deploymentNodes.length; i++) {
    const node = deploymentNodes[i]
    nodes.push({
      id: node.id,
      position: { x: 100 * i, y: 0 },
      type: 'deploymentNode',
      data: node,
    })
    for (const nextNode of node.nextNodes) {
      edges.push({
        id: `${node.id}-${nextNode.id}`,
        source: node.id,
        target: nextNode.id,
        // type: 'smoothstep',
      })
    }
  }

  return {
    nodes,
    edges,
  }
}

function DeploymentNodeNode({
  data,
}: {
  data: GetDeploymentQuery['deployment']['deploymentNodes'][number]
}) {
  return (
    <Card variant="outlined" sx={{ width: nodeWidth, height: nodeHeight }}>
      <CardContent
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingX: 1,
        }}
      >
        <Handle type="target" position={Position.Top} />
        <Typography component="div" variant="h5" sx={{ fontSize: '0.75rem' }}>
          {data.resource.key}
        </Typography>
        <Stack direction="row">
          {data.resource.features.power && <PowerTwoTone fontSize="small" />}
          {data.resource.features.console && (
            <MonitorTwoTone fontSize="small" />
          )}
        </Stack>
        <Handle type="source" position={Position.Bottom} />
      </CardContent>
    </Card>
  )
}

export default function DeploymentDetails() {
  const { id } = useParams()
  const { enqueueSnackbar } = useSnackbar()
  const { fitView } = useReactFlow()
  const navigate = useNavigate()
  const {
    data: getDeploymentData,
    error: getDeploymentError,
    loading: getDeploymentLoading,
  } = useGetDeploymentQuery({ variables: { id: id || '' } })
  const [moreMenuEl, setMoreMenuEl] = useState<null | HTMLElement>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<
    GetDeploymentQuery['deployment']['deploymentNodes'][number]
  >([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const nodeTypes = useMemo(() => ({ deploymentNode: DeploymentNodeNode }), [])
  // Resource context menu
  const [resourceMenuAnchorEl, setResourceMenuAnchorEl] =
    useState<null | HTMLElement>(null)
  const [selectedResourceIndex, setSelectedResourceIndex] = useState<number>(0)
  const resourceMenuOpen = useMemo(
    () => Boolean(resourceMenuAnchorEl),
    [resourceMenuAnchorEl]
  )
  const [selectedResourceMenuItem, setSelectedResourceMenuItem] =
    useState<number>(0)
  const [
    deploymentNodePower,
    {
      data: deploymentNodePowerData,
      error: deploymentNodePowerError,
      loading: deploymentNodePowerLoading,
      reset: resetDeploymentNodePower,
    },
  ] = useDeploymentNodePowerMutation()

  useEffect(() => {
    if (getDeploymentError)
      enqueueSnackbar({
        message: `Failed to get deployment: ${getDeploymentError.message}`,
        variant: 'error',
      })
  }, [getDeploymentError])

  useEffect(() => {
    if (getDeploymentData) {
      const { nodes, edges } = generateFlowData(
        getDeploymentData.deployment.deploymentNodes
      )
      const layouted = getLayoutedElements(nodes, edges, { direction: 'TB' })
      setNodes([...layouted.nodes])
      setEdges([...layouted.edges])

      window.requestAnimationFrame(() => {
        fitView()
      })
    }
  }, [getDeploymentData])

  // DeploymentNodePower
  useEffect(() => {
    if (deploymentNodePowerLoading) return
    if (deploymentNodePowerData) {
      enqueueSnackbar({
        message: deploymentNodePowerData.deploymentNodePower
          ? 'Resource power state updated'
          : 'Failed to update resource power state',
        variant: 'success',
      })
    } else if (deploymentNodePowerError) {
      console.error(deploymentNodePowerError.message)
      enqueueSnackbar({
        message: 'Error ocurred: see console for details',
        variant: 'error',
      })
    }
    setResourceMenuAnchorEl(null)
    resetDeploymentNodePower()
  }, [
    deploymentNodePowerData,
    deploymentNodePowerError,
    deploymentNodePowerLoading,
  ])

  const handleResourceSelect = (
    e: React.MouseEvent<HTMLElement>,
    index: number
  ) => {
    setSelectedResourceIndex(index)
    setResourceMenuAnchorEl(e.currentTarget)
  }

  const handleResourceMenuClose = () => {
    if (getDeploymentLoading) return
    setResourceMenuAnchorEl(null)
  }

  const handleDeploymentPower = (state: PowerState) => {
    if (
      !getDeploymentData ||
      !getDeploymentData.deployment.deploymentNodes[selectedResourceIndex]
    ) {
      enqueueSnackbar({ message: 'Unknown error. Refresh page' })
      return
    } else
      deploymentNodePower({
        variables: {
          id: getDeploymentData.deployment.deploymentNodes[
            selectedResourceIndex
          ].id,
          state,
        },
      })
  }

  return (
    <Container sx={{ py: 3 }}>
      <Button href="/deployments" startIcon={<ChevronLeft />} sx={{ mb: 2 }}>
        Back
      </Button>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="h4">
          Details - {getDeploymentData?.deployment.name}
        </Typography>
        <Button
          id="more-button"
          aria-controls={moreMenuEl ? 'more-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={moreMenuEl ? 'true' : undefined}
          onClick={(e) => setMoreMenuEl(e.currentTarget)}
          startIcon={<ExpandMore />}
        >
          Actions
        </Button>
        <Menu
          id="more-menu"
          anchorEl={moreMenuEl}
          open={Boolean(moreMenuEl)}
          onClose={() => setMoreMenuEl(null)}
          MenuListProps={{
            'aria-labelledby': 'more-button',
          }}
        >
          <MenuItem
            onClick={() =>
              navigate(
                `/deployments/destroy/${getDeploymentData?.deployment.id}`
              )
            }
          >
            Destroy
          </MenuItem>
        </Menu>
      </Box>
      <Divider sx={{ my: 2 }} />
      {getDeploymentLoading && <LinearProgress sx={{ my: 2 }} />}
      <Grid container spacing={2}>
        <Grid item md={3} sx={{ display: 'flex' }}>
          <List sx={{ width: '100%' }}>
            {getDeploymentData?.deployment.deploymentNodes.map((dn, i) => (
              <ListItem
                key={dn.id}
                secondaryAction={
                  <IconButton onClick={(e) => handleResourceSelect(e, i)}>
                    <MoreHoriz />
                  </IconButton>
                }
              >
                {/* <ListItemButton> */}
                {/* <ListItemIcon>
                  <InboxIcon />
                </ListItemIcon> */}
                <ListItemText primary={dn.resource.key} />
                {/* </ListItemButton> */}
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2 }} orientation="vertical" />
          <Menu
            id="lock-menu"
            anchorEl={resourceMenuAnchorEl}
            open={resourceMenuOpen}
            onClose={handleResourceMenuClose}
            MenuListProps={{
              role: 'listbox',
            }}
          >
            {}
            {getDeploymentData?.deployment.deploymentNodes[
              selectedResourceIndex
            ].resource.features.power ? (
              <>
                <MenuItem
                  onClick={() => {
                    setSelectedResourceMenuItem(0)
                    handleDeploymentPower(PowerState.On)
                  }}
                  disabled={deploymentNodePowerLoading}
                >
                  <ListItemIcon>
                    {deploymentNodePowerLoading &&
                    selectedResourceMenuItem === 0 ? (
                      <CircularProgress
                        size="small"
                        color="secondary"
                        sx={{ width: '1rem' }}
                      />
                    ) : (
                      <Power fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText>Power On</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setSelectedResourceMenuItem(1)
                    handleDeploymentPower(PowerState.Off)
                  }}
                  disabled={deploymentNodePowerLoading}
                >
                  <ListItemIcon>
                    {deploymentNodePowerLoading &&
                    selectedResourceMenuItem === 1 ? (
                      <CircularProgress
                        size="small"
                        color="secondary"
                        sx={{ width: '1rem' }}
                      />
                    ) : (
                      <PowerOff fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText>Power Off</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setSelectedResourceMenuItem(2)
                    handleDeploymentPower(PowerState.Reset)
                  }}
                  disabled={deploymentNodePowerLoading}
                >
                  <ListItemIcon>
                    {deploymentNodePowerLoading &&
                    selectedResourceMenuItem === 2 ? (
                      <CircularProgress
                        size="small"
                        color="secondary"
                        sx={{ width: '1rem' }}
                      />
                    ) : (
                      <RestartAlt fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText>Reset</ListItemText>
                </MenuItem>
              </>
            ) : (
              <MenuItem disabled>
                <ListItemText>Power Controls Not Available</ListItemText>
              </MenuItem>
            )}
          </Menu>
        </Grid>
        <Grid item md={9}>
          <Box
            sx={{ width: '100%', height: '100%', minHeight: 500, px: 3, py: 1 }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              attributionPosition="top-right"
              nodeTypes={nodeTypes}
              connectionLineType={ConnectionLineType.SmoothStep}
            >
              <Controls />
              {/* <MiniMap /> */}
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
            {/* <MuiMarkdown>
            {getDeploymentData?.deployment.blueprint.description}
          </MuiMarkdown> */}
          </Box>
        </Grid>
      </Grid>
    </Container>
  )
}
