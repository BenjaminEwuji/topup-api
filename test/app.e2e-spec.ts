import { Test } from "@nestjs/testing"
import { AppModule } from "../src/app.module.js"
import { INestApplication, ValidationPipe } from "@nestjs/common";
import pactum from 'pactum';
 
 
 describe('app e2e', () => {
  let app: INestApplication;
    beforeAll( async() => {
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule]
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe(
            {whitelist: true,
              transform: true,
              forbidNonWhitelisted: true,
              
            }
          ));
        await app.init();
    })

    afterAll(async () => {
      await app.close();
    });

    describe('Auth' ,()=>{
      const dto = {
        email: 'RhodaBrown@gmail.com',
        password: 'Password@123',
        confirmPassword: 'Password@123',
        firstName: 'Roda',
        lastName: 'Brown',
        phoneNumber: '08120056789',
      }
      describe('Signup()', () => {
        it('should throw error if email already exist', async () =>{
           return pactum
           .spec()
           .post('http://localhost:3333/auth/signup')
           .withBody({
            password: dto.password,
            confirmPassword: dto.confirmPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
           })
           .expectStatus(400)
           .inspect
           
        })

         it('should throw error if phone number already exist', async () =>{
           return pactum
           .spec()
           .post('http://localhost:3333/auth/signup')
           .withBody({
            password: dto.password,
            confirmPassword: dto.confirmPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
           })
           .expectStatus(400)
           
        })

         it('should throw error if  password does not match confirm password', async () =>{
           return pactum
           .spec()
           .post('http://localhost:3333/auth/signup')
           .withBody({
            password: 'wrong-password',
            confirmPassword: dto.confirmPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
           })
           .expectStatus(400)
           
        })

         it('should throw error if confirm password does not match password', async () =>{
           return pactum
           .spec()
           .post('http://localhost:3333/auth/signup')
           .withBody({
            password: 'wrong-password',
            confirmPassword: dto.confirmPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
           })
           .expectStatus(400)
           
        })

        
      })
      describe('Login()', () => {
        it('should save a user' , async () =>{
          return pactum
           .spec()
           .post('http://localhost:3333/auth/login')
           .withBody({
            password: dto.password,
            confirmPassword: dto.confirmPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
           })
           .expectStatus(400)
        }) 
         it('should sign in' , async () =>{
          return pactum
           .spec()
           .post('http://localhost:3333/auth/login')
           .withBody({
            phoneNumber: dto.phoneNumber,
            password: dto.password,
            email: dto.email,
           })
           .expectStatus(201)
           .stores('refreshToken', 'refresh_token')
           .inspect()
        }) 
      })

      describe('Logout()', () => {
        it('should throw error if refresh token is missing', () => {
          return pactum
            .spec()
            .post('http://localhost:3333/auth/logout')
            .withBody({})
            .expectStatus(400)
            .expectBodyContains('Refresh token is required');
        });

        it('should logout successfully', () => {
          return pactum
            .spec()
            .post('http://localhost:3333/auth/logout')
            .withBody({
              refreshToken: '$S{refreshToken}',
            })
            .expectStatus(200)
            .expectBodyContains('Logged out successfully');
        });

        it('should logout from all devices', () => {
          return pactum
            .spec()
            .post('http://localhost:3333/auth/logout')
            .withBody({
              refreshToken: '$S{refreshToken}',
              allDevices: true,
            })
            .expectStatus(200)
            .expectBodyContains('Logged out from all devices successfully');
        });
      })
    })

    describe('Users', () =>{
      it.todo('should return a message')
    })

    it.todo('should return a message')
 })