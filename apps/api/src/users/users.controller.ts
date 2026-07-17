import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get(':username')
  profile(@Param('username') username: string) {
    return this.users.profile(username);
  }
}
