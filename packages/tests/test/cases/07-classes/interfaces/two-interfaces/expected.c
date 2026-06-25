#include "runtime.h"

typedef struct { String (*getName)(void *self); } Named_vtable;
typedef struct { void *self; const Named_vtable *vtable; } Named;

typedef struct { int32_t (*getAge)(void *self); } Aged_vtable;
typedef struct { void *self; const Aged_vtable *vtable; } Aged;

typedef struct { String name; int32_t age; } Person;

static String Person_getName(const Person *self) {
    tsc_string_retain(self->name);
    return self->name;
}

static int32_t Person_getAge(const Person *self) {
    return self->age;
}

void greet_Named(Named n) {
    printf("%s\n", n.vtable->getName(n.self).data);
}

static void Person_free(Person *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

static const Named_vtable _Person_Named_vtable = {
    .getName = (String (*)(void *))Person_getName,
};

int main(void) {
    TSC_INIT();
    Person p = {0};
    { String _tsc_tmp = STR_LIT("Alice"); tsc_string_retain(_tsc_tmp); tsc_string_release(p.name); p.name = _tsc_tmp; }
    p.age = 30;
    Named _n_p = { .self = &p, .vtable = &_Person_Named_vtable };
    greet_Named(_n_p);
    Person_free(&p);
    return 0;
}
