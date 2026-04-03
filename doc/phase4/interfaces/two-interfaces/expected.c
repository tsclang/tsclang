#include "runtime.h"

typedef struct { String (*getName)(void *self); } Named_vtable;
typedef struct { void *self; const Named_vtable *vtable; } Named;

typedef struct { int32_t (*getAge)(void *self); } Aged_vtable;
typedef struct { void *self; const Aged_vtable *vtable; } Aged;

typedef struct { String name; int32_t age; } Person;

static String Person_getName(Person *self) {
    return self->name;
}

static int32_t Person_getAge(Person *self) {
    return self->age;
}

static const Named_vtable _Person_Named_vtable = {
    .getName = (String (*)(void *))Person_getName,
};

static const Aged_vtable _Person_Aged_vtable = {
    .getAge = (int32_t (*)(void *))Person_getAge,
};

void greet_Named(Named n) {
    String _s = n.vtable->getName(n.self);
    printf("%s\n", _s.data);
}

int main(void) {
    TSC_INIT();
    Person p = {0};
    p.name = STR_LIT("Alice");
    p.age = 30;
    Named _n_p = { .self = &p, .vtable = &_Person_Named_vtable };
    greet_Named(_n_p);
    return 0;
}
