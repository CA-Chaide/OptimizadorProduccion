import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const personnelData = [
  {
    name: 'John Doe',
    email: 'john.d@example.com',
    role: 'Machine Operator',
    skills: ['Assembly', 'CNC'],
    status: 'Active',
  },
  {
    name: 'Jane Smith',
    email: 'jane.s@example.com',
    role: 'Quality Inspector',
    skills: ['Quality Control', 'Six Sigma'],
    status: 'Active',
  },
  {
    name: 'Peter Jones',
    email: 'peter.j@example.com',
    role: 'Team Lead',
    skills: ['Leadership', 'Planning'],
    status: 'Active',
  },
  {
    name: 'Mary Johnson',
    email: 'mary.j@example.com',
    role: 'Maintenance Tech',
    skills: ['Repair', 'Troubleshooting'],
    status: 'On Leave',
  },
];

export default function PersonnelPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Personnel Management
        </h1>
        <Dialog>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                Add Personnel
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                <DialogTitle>Add New Personnel</DialogTitle>
                <DialogDescription>
                    Fill in the details for the new employee.
                </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                    Name
                    </Label>
                    <Input id="name" placeholder="John Doe" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                    Email
                    </Label>
                    <Input id="email" type="email" placeholder="john.d@example.com" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="role" className="text-right">
                    Role
                    </Label>
                    <Input id="role" placeholder="Machine Operator" className="col-span-3" />
                </div>
                </div>
                <DialogFooter>
                <Button type="submit">Save Personnel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Employee Roster</CardTitle>
          <CardDescription>
            List of all employees and their roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnelData.map((person) => (
                <TableRow key={person.email}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src={`https://placehold.co/40x40.png?text=${person.name.charAt(0)}`} alt={person.name} />
                            <AvatarFallback>{person.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="font-medium">{person.name}</div>
                            <div className="text-sm text-muted-foreground">{person.email}</div>
                        </div>
                    </div>
                  </TableCell>
                  <TableCell>{person.role}</TableCell>
                  <TableCell className="space-x-1">
                    {person.skills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={person.status === 'Active' ? 'default' : 'outline'} className={person.status === 'Active' ? 'bg-green-500' : ''}>{person.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button aria-haspopup="true" size="icon" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
