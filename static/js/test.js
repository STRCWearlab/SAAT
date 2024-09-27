class A{
    constructor(B=1){}
}

class C{
    constructor(D=1){
        this.a = new A(D);
    }
}

b = new C(D=1);
console.log(b)