'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

export default function ConstraintsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Constraint Configuration
      </h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Operational Constraints</CardTitle>
            <CardDescription>
              Set general rules for production shifts and machinery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="overtime-switch">
                Enable Overtime
                <p className="text-sm text-muted-foreground">
                  Allow scheduling of overtime hours.
                </p>
              </Label>
              <Switch id="overtime-switch" defaultChecked />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-shift-hours">Max Shift Length (hours)</Label>
              <Input id="max-shift-hours" type="number" defaultValue={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-threshold">
                Machine Maintenance Threshold (units)
              </Label>
              <Slider
                id="maintenance-threshold"
                defaultValue={[5000]}
                max={10000}
                step={100}
              />
              <p className="text-sm text-muted-foreground text-right">5000 units</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button>Save Operational Constraints</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personnel Constraints</CardTitle>
            <CardDescription>
              Define constraints related to your workforce.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="min-skill-level">
                Minimum Skill Level for Critical Tasks
              </Label>
              <Slider
                id="min-skill-level"
                defaultValue={[3]}
                min={1}
                max={5}
                step={1}
              />
               <p className="text-sm text-muted-foreground text-right">Level 3</p>
            </div>
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="consecutive-shifts-switch">
                Limit Consecutive Shifts
                <p className="text-sm text-muted-foreground">
                    Prevent workers from being assigned too many shifts in a row.
                </p>
              </Label>
              <Switch id="consecutive-shifts-switch" defaultChecked />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-consecutive-shifts">
                Max Consecutive Shifts
              </Label>
              <Input
                id="max-consecutive-shifts"
                type="number"
                defaultValue={5}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button>Save Personnel Constraints</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
